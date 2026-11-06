/**
 * Game persistence on Arkiv (rabdi testnet). Each game and each saved scene is one Arkiv
 * entity, tagged with `project` + `entityType` so anyone can query this app's data.
 * Without ARKIV_SIGNER_KEY an in-memory store stands in (lost on restart), so the app
 * still runs locally.
 */

import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, asc, desc, eq } from "@arkiv-network/sdk/query";
import { bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { hexToBytes, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withRetry, DEFAULT_RETRY_OPTS } from "@/lib/retry";
import type { GameRecord, GameSceneRow } from "@/lib/types/server";

/** Fields set when a game is created; the rest are filled in by the store. */
export type NewGame = Pick<GameRecord, "owner" | "title" | "idea" | "bible" | "premise">;
/** Fields that change after creation. */
export type GamePatch = Partial<
  Pick<GameRecord, "sprite_url" | "finale" | "thumbnail_url" | "sealed_victory">
>;
/** A scene as saved, before the store assigns ids. */
export type NewScene = Omit<GameSceneRow, "id" | "game_id">;

/** What routes need from persistence. */
export interface GameStore {
  readonly name: "arkiv" | "memory";
  /** Newest first; all players' games when `owner` is omitted. */
  listGames(owner?: string): Promise<GameRecord[]>;
  countGames(owner: string): Promise<number>;
  getGame(id: string): Promise<GameRecord | null>;
  createGame(game: NewGame): Promise<GameRecord>;
  updateGame(id: string, patch: GamePatch): Promise<void>;
  /** Deletes the game and its scenes. */
  deleteGame(id: string): Promise<void>;
  /** Oldest first. */
  listScenes(gameId: string): Promise<GameSceneRow[]>;
  /** Inserts or replaces the scene with the same `scene_id` in this game. */
  upsertScene(gameId: string, scene: NewScene): Promise<{ row: GameSceneRow; created: boolean }>;
}

const LIST_LIMIT = 200;
// shortcut: Arkiv entities expire; 90 days covers the event and judging. Extend on play
//   (extendEntity) if games must live longer.
const GAME_DAYS = 90;

/* ------------------------------------------------------------------ */
/* Arkiv                                                               */
/* ------------------------------------------------------------------ */

const base = { project: str().indexed(), entityType: str().indexed() } as const;

/** A game. `record` is the gzipped JSON of the game record without its id. */
const GameEntity = defineSchema({
  ...base,
  /** Hash of the owner's World ID nullifier. */
  owner: str().indexed(),
  /** Unix ms, indexed so listings sort newest first on the node. */
  createdAt: u64().indexed(),
  record: bytes(),
});

/** A saved scene. `record` is the gzipped JSON of the scene row. */
const SceneEntity = defineSchema({
  ...base,
  gameId: str().indexed(),
  sceneId: str().indexed(),
  createdAt: u64().indexed(),
  record: bytes(),
});

const pack = (value: unknown) => gzipSync(JSON.stringify(value));
const unpack = <T>(hex: Hex): T => JSON.parse(gunzipSync(hexToBytes(hex)).toString("utf8")) as T;
const isEntityKey = (k: string) => /^0x[0-9a-fA-F]{64}$/.test(k);

function createArkivStore(signerKey: string): GameStore {
  const project = process.env.ARKIV_PROJECT_ID || "ETH Jasoos";
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
  const transport = http(process.env.ARKIV_RPC_URL || undefined);
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
  const write = <T>(fn: () => Promise<T>) => serial(() => withRetry(fn, DEFAULT_RETRY_OPTS));

  const scope = (entityType: string) => and(eq("project", project), eq("entityType", entityType));
  const toGame = (key: string, hex: Hex): GameRecord => ({ ...unpack<Omit<GameRecord, "id">>(hex), id: key });

  async function findScene(gameId: string, sceneId: string) {
    const page = await reader
      .select({ $key: true })
      .from(SceneEntity)
      .where(and(scope("scene"), eq("gameId", gameId), eq("sceneId", sceneId)))
      .limit(1)
      .fetch();
    return page.entities[0]?.$key as Hex | undefined;
  }

  return {
    name: "arkiv",

    async listGames(owner) {
      const page = await reader
        .select({ $key: true, record: true })
        .from(GameEntity)
        .where(owner ? and(scope("game"), eq("owner", owner)) : scope("game"))
        .orderBy(desc("createdAt"))
        .limit(LIST_LIMIT)
        .fetch();
      return page.entities.map((row) => toGame(row.$key, row.record.value));
    },

    async countGames(owner) {
      return Number(
        await reader.count().from(GameEntity).where(and(scope("game"), eq("owner", owner))).fetch()
      );
    },

    async getGame(id) {
      if (!isEntityKey(id)) return null;
      try {
        const row = await reader.getEntity(id as Hex, GameEntity);
        if (row.project.value !== project || row.entityType.value !== "game") return null;
        return toGame(id, row.record.value);
      } catch {
        // Missing or expired entities read as "not found".
        return null;
      }
    },

    async createGame(game) {
      const now = new Date().toISOString();
      const record: Omit<GameRecord, "id"> = {
        ...game,
        sprite_url: null,
        finale: {},
        thumbnail_url: null,
        created_at: now,
        updated_at: now,
      };
      const { entityKey, txHash } = await write(() =>
        writer.createEntity(
          GameEntity,
          {
            project,
            entityType: "game",
            owner: game.owner,
            createdAt: u64(Date.parse(now)),
            record: pack(record),
          },
          { expiration: ExpirationTime.fromDays(GAME_DAYS) }
        )
      );
      console.info("[arkiv] game", entityKey, "tx", txHash);
      return { ...record, id: entityKey };
    },

    async updateGame(id, patch) {
      const game = await this.getGame(id);
      if (!game) throw new Error(`Game ${id} not found on Arkiv.`);
      const { id: _id, ...rest } = { ...game, ...patch, updated_at: new Date().toISOString() };
      void _id;
      await write(() => writer.patchEntity(GameEntity, id as Hex, { set: { record: pack(rest) } }));
    },

    async deleteGame(id) {
      const scenes = await reader
        .select({ $key: true })
        .from(SceneEntity)
        .where(and(scope("scene"), eq("gameId", id)))
        .limit(LIST_LIMIT)
        .fetch();
      for (const s of scenes.entities) {
        await write(() => writer.deleteEntity({ entityKey: s.$key as Hex }));
      }
      if (isEntityKey(id)) await write(() => writer.deleteEntity({ entityKey: id as Hex }));
    },

    async listScenes(gameId) {
      const page = await reader
        .select({ $key: true, record: true })
        .from(SceneEntity)
        .where(and(scope("scene"), eq("gameId", gameId)))
        .orderBy(asc("createdAt"))
        .limit(LIST_LIMIT)
        .fetch();
      return page.entities.map((row) => ({
        ...unpack<NewScene>(row.record.value),
        id: row.$key,
        game_id: gameId,
      }));
    },

    async upsertScene(gameId, scene) {
      const existing = await findScene(gameId, scene.scene_id);
      if (existing) {
        await write(() =>
          writer.patchEntity(SceneEntity, existing, { set: { record: pack(scene) } })
        );
        return { row: { ...scene, id: existing, game_id: gameId }, created: false };
      }
      const { entityKey } = await write(() =>
        writer.createEntity(
          SceneEntity,
          {
            project,
            entityType: "scene",
            gameId,
            sceneId: scene.scene_id,
            createdAt: u64(Date.now()),
            record: pack(scene),
          },
          { expiration: ExpirationTime.fromDays(GAME_DAYS) }
        )
      );
      return { row: { ...scene, id: entityKey, game_id: gameId }, created: true };
    },
  };
}

/* ------------------------------------------------------------------ */
/* In-memory stand-in                                                  */
/* ------------------------------------------------------------------ */

function createMemoryStore(): GameStore {
  const games = new Map<string, GameRecord>();
  const scenes = new Map<string, GameSceneRow[]>();
  return {
    name: "memory",
    async listGames(owner) {
      return [...games.values()]
        .filter((g) => !owner || g.owner === owner)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async countGames(owner) {
      return [...games.values()].filter((g) => g.owner === owner).length;
    },
    async getGame(id) {
      return games.get(id) ?? null;
    },
    async createGame(game) {
      const now = new Date().toISOString();
      const record: GameRecord = {
        ...game,
        id: randomUUID(),
        sprite_url: null,
        finale: {},
        thumbnail_url: null,
        created_at: now,
        updated_at: now,
      };
      games.set(record.id, record);
      return record;
    },
    async updateGame(id, patch) {
      const game = games.get(id);
      if (game) games.set(id, { ...game, ...patch, updated_at: new Date().toISOString() });
    },
    async deleteGame(id) {
      games.delete(id);
      scenes.delete(id);
    },
    async listScenes(gameId) {
      return scenes.get(gameId) ?? [];
    },
    async upsertScene(gameId, scene) {
      const list = scenes.get(gameId) ?? [];
      const i = list.findIndex((s) => s.scene_id === scene.scene_id);
      const row: GameSceneRow = { ...scene, id: list[i]?.id ?? randomUUID(), game_id: gameId };
      if (i >= 0) list[i] = row;
      else list.push(row);
      scenes.set(gameId, list);
      return { row, created: i < 0 };
    },
  };
}

const globalStore = globalThis as unknown as { __ETHJasoosGameStore?: GameStore };

/** The process-wide store: Arkiv when ARKIV_SIGNER_KEY is set, memory otherwise. */
export function gameStore(): GameStore {
  const key = process.env.ARKIV_SIGNER_KEY;
  globalStore.__ETHJasoosGameStore ??= key ? createArkivStore(key) : createMemoryStore();
  return globalStore.__ETHJasoosGameStore;
}
