import type { Accusation, Manifest, PublicManifest, WorldSummary } from "@/lib/types";
import { env, processStore } from "@/lib/env";
import { fixtureManifest } from "@/fixtures/world";
import type { ArkivBackend } from "./backend";
import { createLiveBackend } from "./live";
import { memoryBackend } from "./memory";

/**
 * Arkiv entities: worlds, creations (daily quota), visits, accusations (one per human per case).
 * With ARKIV_SIGNER_KEY set, every call reads or writes the rabdi testnet; without it, an
 * in-memory store with the same expiry rules stands in. The fixture world is always readable as
 * the labelled backup world.
 */

const backend = (): ArkivBackend =>
  env.arkiv.live ? processStore("arkivLive", createLiveBackend) : memoryBackend();

export const arkivMode = () => backend().name;

const GALLERY_LIMIT = 24;

/** Writes the `world` and `creation` entities. Returns their keys. */
export async function publishWorld(
  manifest: Manifest,
  humanHash: string,
): Promise<{ worldKey: string; creationKey: string }> {
  return backend().publishWorld(manifest, humanHash);
}

/** Live worlds, newest first. The fixture backup world is listed only without Arkiv. */
export async function listWorlds(): Promise<WorldSummary[]> {
  const worlds = await backend().listWorlds(GALLERY_LIMIT);
  if (env.arkiv.live) return worlds;
  const m = fixtureManifest;
  return [
    ...worlds,
    {
      worldKey: m.worldId,
      title: m.bible.title,
      premise: m.bible.premise,
      thumbnailUrl: m.assets.find((a) => a.kind === "street")?.url ?? "",
      createdAt: m.createdAt,
      visits: 0,
    },
  ];
}

/** Full manifest, mystery included. Server-only: strip `mystery` before sending to a browser. */
export async function getWorld(worldKey: string): Promise<Manifest | undefined> {
  if (worldKey === fixtureManifest.worldId) return fixtureManifest;
  return backend().getWorld(worldKey);
}

/** R12: live `creation` entities for one human. Expiry after 24h is the quota window. */
export async function countCreations(humanHash: string): Promise<number> {
  return backend().countCreations(humanHash);
}

// Jobs that passed the quota check but have not written their `creation` entity yet. Counted
// against the limit so parallel requests cannot start more jobs than the quota allows.
const pending = processStore("pendingCreations", () => new Map<string, number>());

export type QuotaCheck =
  | { allowed: true; release: () => void }
  | { allowed: false; used: number; limit: number; nextSlotAt: Date | null };

/**
 * Checks the daily limit and, if there is room, reserves a slot until the world is published or
 * the job fails. Call `release()` exactly once when the job ends either way.
 */
export async function reserveCreation(humanHash: string, limit: number): Promise<QuotaCheck> {
  const live = await backend().countCreations(humanHash);
  const inFlight = pending.get(humanHash) ?? 0;
  const used = live + inFlight;
  if (used >= limit) {
    const nextSlotAt = live > 0 ? await backend().nextSlotAt(humanHash) : null;
    return { allowed: false, used, limit, nextSlotAt };
  }
  pending.set(humanHash, inFlight + 1);
  let released = false;
  return {
    allowed: true,
    release: () => {
      if (released) return;
      released = true;
      const n = (pending.get(humanHash) ?? 1) - 1;
      if (n > 0) pending.set(humanHash, n);
      else pending.delete(humanHash);
    },
  };
}

// A reservation belongs to a job. If the job's stream is never opened, it still frees itself.
const held = processStore("heldReservations", () => new Map<string, () => void>());
const HOLD_MAX_MS = 10 * 60 * 1000;

export function holdReservation(jobId: string, release: () => void): void {
  const timer = setTimeout(() => releaseReservation(jobId), HOLD_MAX_MS);
  timer.unref?.();
  held.set(jobId, () => {
    clearTimeout(timer);
    release();
  });
}

export function releaseReservation(jobId: string): void {
  held.get(jobId)?.();
  held.delete(jobId);
}

/** Writes a short-lived `visit` entity. Returns the live visit count. */
export async function recordVisit(worldKey: string): Promise<number> {
  return backend().recordVisit(worldKey);
}

export async function recordAccusation(acc: Accusation, correct: boolean): Promise<void> {
  return backend().recordAccusation(acc, correct);
}

/** R24: is there a live `accusation` entity for this world key and human? */
export async function hasAccused(worldKey: string, humanHash: string): Promise<boolean> {
  return backend().hasAccused(worldKey, humanHash);
}

const accusing = processStore("accusing", () => new Set<string>());

/**
 * Runs `fn` only if this human has no accusation in progress for this case, so two parallel
 * requests cannot both pass the `hasAccused` check before either writes. Returns null if busy.
 */
export async function oneAccusationAtATime<T>(
  worldKey: string,
  humanHash: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const k = `${worldKey}:${humanHash}`;
  if (accusing.has(k)) return null;
  accusing.add(k);
  try {
    return await fn();
  } finally {
    accusing.delete(k);
  }
}

/** Removes the mystery (secret and culprit) so the manifest is safe to send to a browser. */
export function toPublicManifest(m: Manifest): PublicManifest {
  const { mystery, ...bible } = m.bible;
  void mystery;
  return { ...m, bible };
}
