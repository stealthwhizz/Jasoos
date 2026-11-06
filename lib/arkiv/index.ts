import { randomUUID } from "node:crypto";
import type { Accusation, Manifest, PublicManifest, WorldSummary } from "@/lib/types";
import { env, processStore } from "@/lib/env";
import { fixtureManifest } from "@/fixtures/world";

// Fixture stand-in for Arkiv. Every entity carries project + entityType attributes on the real chain.
// TODO(C): replace each function body with @arkiv-network/sdk reads/writes on rabdi; keep the signatures.
const DAY_MS = 24 * 60 * 60 * 1000;

interface Store {
  worlds: Map<string, { manifest: Manifest; visits: number }>;
  creations: Array<{ humanHash: string; worldKey: string; at: number }>;
  accusations: Array<Accusation & { correct: boolean }>;
}

const store = processStore<Store>("arkiv", () => ({
  worlds: new Map([[fixtureManifest.worldId, { manifest: fixtureManifest, visits: 0 }]]),
  creations: [],
  accusations: [],
}));

function fixturesOnly(fn: string): void {
  if (!env.useFixtures) throw new Error(`arkiv.${fn}: real Arkiv calls not implemented (TODO(C))`);
}

/** Writes the `world` and `creation` entities. Returns their keys. */
export async function publishWorld(
  manifest: Manifest,
  humanHash: string,
): Promise<{ worldKey: string; creationKey: string }> {
  fixturesOnly("publishWorld");
  // TODO(C): upload manifest to 0G Storage first; the entity holds only references (R14).
  const worldKey = `fx-world-${randomUUID().slice(0, 8)}`;
  store.worlds.set(worldKey, { manifest: { ...manifest, worldId: worldKey }, visits: 0 });
  store.creations.push({ humanHash, worldKey, at: Date.now() });
  return { worldKey, creationKey: `fx-creation-${randomUUID().slice(0, 8)}` };
}

/** Live worlds, newest first. TODO(C): Arkiv query entityType = world; sort in app if needed. */
export async function listWorlds(): Promise<WorldSummary[]> {
  fixturesOnly("listWorlds");
  return [...store.worlds.entries()]
    .map(([worldKey, { manifest: m, visits }]) => ({
      worldKey,
      title: m.bible.title,
      premise: m.bible.premise,
      thumbnailUrl: m.assets.find((a) => a.kind === "street")?.url ?? "",
      createdAt: m.createdAt,
      visits,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Full manifest, mystery included. Server-only: strip `mystery` before sending to a browser. */
export async function getWorld(worldKey: string): Promise<Manifest | undefined> {
  fixturesOnly("getWorld");
  return store.worlds.get(worldKey)?.manifest;
}

/** R12: live `creation` entities for one human. Expiry after 24h is the quota window. */
export async function countCreations(humanHash: string): Promise<number> {
  fixturesOnly("countCreations");
  const since = Date.now() - DAY_MS;
  return store.creations.filter((c) => c.humanHash === humanHash && c.at > since).length;
}

/** Writes a short-lived `visit` entity. Returns the live visit count. */
export async function recordVisit(worldKey: string): Promise<number> {
  fixturesOnly("recordVisit");
  const world = store.worlds.get(worldKey);
  if (!world) return 0;
  return ++world.visits;
}

export async function recordAccusation(acc: Accusation, correct: boolean): Promise<void> {
  fixturesOnly("recordAccusation");
  store.accusations.push({ ...acc, correct });
}

/** R24: is there a live `accusation` entity for this world key and human? */
export async function hasAccused(worldKey: string, humanHash: string): Promise<boolean> {
  fixturesOnly("hasAccused");
  return store.accusations.some((a) => a.worldKey === worldKey && a.humanHash === humanHash);
}

/** Removes the mystery (secret and culprit) so the manifest is safe to send to a browser. */
export function toPublicManifest(m: Manifest): PublicManifest {
  const { mystery, ...bible } = m.bible;
  void mystery;
  return { ...m, bible };
}
