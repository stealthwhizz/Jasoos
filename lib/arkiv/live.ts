import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, asc, eq } from "@arkiv-network/sdk/query";
import { u64 } from "@arkiv-network/sdk/schema";
import { hexToBytes, http, stringToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Manifest } from "@/lib/types";
import { env } from "@/lib/env";
import { randomUUID } from "node:crypto";
import type { ArkivBackend } from "./backend";
import { queryGallery } from "./gallery";
import { fitString, openMystery, packManifest, sealMystery, unpackManifest } from "./codec";
import { AccusationEntity, CreationEntity, LIFETIME, VisitEntity, WorldEntity } from "./schemas";

// Real Arkiv on the rabdi testnet. One server-held signer writes every entity (see README
// "Known limits"); reads are plain queries anyone can run.

const MANIFEST_TTL_MS = 5 * 60 * 1000;
/** Extend a world's life on play, at most once per world per hour (each extension is a tx). */
const EXTEND_EVERY_MS = 60 * 60 * 1000;

export function createLiveBackend(): ArkivBackend {
  const { signerKey, accessKey, rpcUrl } = env.arkiv;
  // New worlds are sealed with MYSTERY_SEAL_KEY when set, so the signer can change without
  // losing answers. Worlds sealed before it existed used the signer key: try that second.
  const sealKey = process.env.MYSTERY_SEAL_KEY || signerKey;
  const openKeys = [...new Set([sealKey, signerKey].filter(Boolean))];
  const open = (sealed: Uint8Array) => {
    for (const k of openKeys) {
      try {
        return openMystery(sealed, k);
      } catch {
        // wrong key: try the next one
      }
    }
    throw new Error("Cannot open the sealed mystery with any configured key.");
  };
  const project = env.projectId;
  const chain = rabdi({ accessKey });
  const transport = http(rpcUrl);
  const reader = createPublicClient({ chain, transport });
  const writer = createWalletClient({
    chain,
    transport,
    account: privateKeyToAccount(signerKey as Hex),
  });

  // One signer: send transactions one at a time so nonces never collide.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const scope = (entityType: string) => and(eq("project", project), eq("entityType", entityType));

  const manifests = new Map<string, { manifest: Manifest; at: number }>();
  const lastExtended = new Map<string, number>();

  /** Converts a block number to a wall-clock time using the recent average block time. */
  async function blockToDate(block: bigint): Promise<Date> {
    const latest = await reader.getBlock();
    const back = latest.number > 1000n ? 1000n : latest.number;
    const earlier =
      back > 0n ? await reader.getBlock({ blockNumber: latest.number - back }) : latest;
    const secondsPerBlock =
      back > 0n ? Number(latest.timestamp - earlier.timestamp) / Number(back) : 2;
    const seconds = Number(block - latest.number) * secondsPerBlock;
    return new Date(Number(latest.timestamp) * 1000 + Math.max(0, seconds) * 1000);
  }

  const isEntityKey = (k: string) => /^0x[0-9a-fA-F]{64}$/.test(k);

  async function countVisits(worldKey: string): Promise<number> {
    const n = await reader
      .count()
      .from(VisitEntity)
      .where(and(scope("visit"), eq("worldKey", worldKey)))
      .fetch();
    return Number(n);
  }

  return {
    name: "arkiv",

    async publishWorld(manifest, humanHash) {
      const summary = {
        premise: manifest.bible.premise,
        thumbnailUrl: manifest.assets.find((a) => a.kind === "street")?.url ?? "",
      };
      const publishId = randomUUID();
      // World and creation in one transaction: both land, or neither does.
      const batch = await serial(() =>
        writer.executeBatch({
          creates: [
            {
              schema: WorldEntity,
              values: {
                project,
                entityType: "world",
                createdAt: u64(Date.parse(manifest.createdAt) || Date.now()),
                publishId,
                title: fitString(manifest.bible.title),
                summary: stringToBytes(JSON.stringify(summary)),
                manifest: packManifest(manifest),
                sealedMystery: sealMystery(manifest.bible.mystery, sealKey),
              },
              expiration: ExpirationTime.fromDays(LIFETIME.worldDays),
            },
            {
              schema: CreationEntity,
              values: { project, entityType: "creation", humanHash, publishId },
              expiration: ExpirationTime.fromHours(LIFETIME.creationHours),
            },
          ],
        }),
      );
      const [worldKey, creationKey] = batch.createdEntities;
      if (!worldKey || !creationKey) throw new Error("Arkiv batch returned no entity keys.");
      console.info("[arkiv] world", worldKey, "tx", batch.txHash);
      return { worldKey, creationKey };
    },

    async listWorlds(limit) {
      return queryGallery(reader, project, limit);
    },

    async getWorld(worldKey) {
      const cached = manifests.get(worldKey);
      if (cached && Date.now() - cached.at < MANIFEST_TTL_MS) return cached.manifest;
      if (!/^0x[0-9a-fA-F]{64}$/.test(worldKey)) return undefined;
      try {
        const row = await reader.getEntity(worldKey as Hex, WorldEntity);
        if (row.project.value !== project || row.entityType.value !== "world") return undefined;
        const manifest = unpackManifest(
          hexToBytes(row.manifest.value),
          open(hexToBytes(row.sealedMystery.value)),
          worldKey,
        );
        manifests.set(worldKey, { manifest, at: Date.now() });
        return manifest;
      } catch (err) {
        // Missing or expired entities read as "not found", the same as a cold case.
        console.warn("[arkiv] getWorld", worldKey, err instanceof Error ? err.message : err);
        manifests.delete(worldKey);
        return undefined;
      }
    },

    async countCreations(humanHash) {
      const n = await reader
        .count()
        .from(CreationEntity)
        .where(and(scope("creation"), eq("humanHash", humanHash)))
        .fetch();
      return Number(n);
    },

    async nextSlotAt(humanHash) {
      const page = await reader
        .select({ $expiresAt: true })
        .from(CreationEntity)
        .where(and(scope("creation"), eq("humanHash", humanHash)))
        .orderBy(asc("$expiresAt"))
        .limit(1)
        .fetch();
      const first = page.entities[0];
      return first ? blockToDate(BigInt(first.$expiresAt)) : null;
    },

    async recordVisit(worldKey) {
      // Played worlds stay alive; unplayed ones go cold and leave the gallery (R25). The
      // extension rides in the same transaction as the visit, at most once an hour per world.
      const last = lastExtended.get(worldKey) ?? 0;
      const extend = isEntityKey(worldKey) && Date.now() - last > EXTEND_EVERY_MS;
      await serial(() =>
        writer.executeBatch({
          creates: [
            {
              schema: VisitEntity,
              values: { project, entityType: "visit", worldKey },
              expiration: ExpirationTime.fromHours(LIFETIME.visitHours),
            },
          ],
          extensions: extend
            ? [
                {
                  entityKey: worldKey as Hex,
                  expiration: ExpirationTime.fromDays(LIFETIME.worldDays),
                },
              ]
            : [],
        }),
      );
      if (extend) lastExtended.set(worldKey, Date.now());
      return countVisits(worldKey);
    },

    async recordAccusation(acc, correct) {
      await serial(() =>
        writer.createEntity(
          AccusationEntity,
          {
            project,
            entityType: "accusation",
            worldKey: acc.worldKey,
            humanHash: acc.humanHash,
            correct,
          },
          { expiration: ExpirationTime.fromDays(LIFETIME.accusationDays) },
        ),
      );
    },

    async hasAccused(worldKey, humanHash) {
      const n = await reader
        .count()
        .from(AccusationEntity)
        .where(and(scope("accusation"), eq("worldKey", worldKey), eq("humanHash", humanHash)))
        .fetch();
      return n > 0n;
    },
  };
}
