import { randomUUID } from "node:crypto";
import type { Accusation, Manifest } from "@/lib/types";
import { processStore } from "@/lib/env";
import type { ArkivBackend } from "./backend";
import { LIFETIME } from "./schemas";

// In-memory stand-in for Arkiv, used when no ARKIV_SIGNER_KEY is set. Same expiry rules, so the
// quota and visit logic behave as they do on chain. Lost on restart.

const HOUR = 60 * 60 * 1000;

interface Store {
  worlds: Map<string, { manifest: Manifest; expiresAt: number }>;
  creations: Array<{ humanHash: string; worldKey: string; expiresAt: number }>;
  visits: Array<{ worldKey: string; expiresAt: number }>;
  accusations: Array<Accusation & { correct: boolean; expiresAt: number }>;
}

export function createMemoryBackend(now: () => number = Date.now): ArkivBackend {
  const store: Store = { worlds: new Map(), creations: [], visits: [], accusations: [] };
  const live = <T extends { expiresAt: number }>(rows: T[]) =>
    rows.filter((r) => r.expiresAt > now());

  return {
    name: "memory",

    async publishWorld(manifest, humanHash) {
      const worldKey = `mem-world-${randomUUID().slice(0, 8)}`;
      store.worlds.set(worldKey, {
        manifest: { ...manifest, worldId: worldKey },
        expiresAt: now() + LIFETIME.worldDays * 24 * HOUR,
      });
      store.creations.push({
        humanHash,
        worldKey,
        expiresAt: now() + LIFETIME.creationHours * HOUR,
      });
      return { worldKey, creationKey: `mem-creation-${randomUUID().slice(0, 8)}` };
    },

    async listWorlds(limit) {
      return [...store.worlds.entries()]
        .filter(([, w]) => w.expiresAt > now())
        .map(([worldKey, { manifest: m }]) => ({
          worldKey,
          title: m.bible.title,
          premise: m.bible.premise,
          thumbnailUrl: m.assets.find((a) => a.kind === "street")?.url ?? "",
          createdAt: m.createdAt,
          visits: live(store.visits).filter((v) => v.worldKey === worldKey).length,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },

    async getWorld(worldKey) {
      const w = store.worlds.get(worldKey);
      return w && w.expiresAt > now() ? w.manifest : undefined;
    },

    async countCreations(humanHash) {
      return live(store.creations).filter((c) => c.humanHash === humanHash).length;
    },

    async nextSlotAt(humanHash) {
      const mine = live(store.creations).filter((c) => c.humanHash === humanHash);
      if (!mine.length) return null;
      return new Date(Math.min(...mine.map((c) => c.expiresAt)));
    },

    async recordVisit(worldKey) {
      store.visits.push({ worldKey, expiresAt: now() + LIFETIME.visitHours * HOUR });
      return live(store.visits).filter((v) => v.worldKey === worldKey).length;
    },

    async recordAccusation(acc, correct) {
      store.accusations.push({
        ...acc,
        correct,
        expiresAt: now() + LIFETIME.accusationDays * 24 * HOUR,
      });
    },

    async hasAccused(worldKey, humanHash) {
      return live(store.accusations).some(
        (a) => a.worldKey === worldKey && a.humanHash === humanHash,
      );
    },
  };
}

/** The process-wide memory backend (survives dev hot reloads). */
export const memoryBackend = () => processStore("arkivMemory", () => createMemoryBackend());
