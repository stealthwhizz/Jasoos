import type { Accusation, Manifest, WorldSummary } from "@/lib/types";

/** What lib/arkiv needs from storage. `live.ts` writes to Arkiv; `memory.ts` stands in without keys. */
export interface ArkivBackend {
  readonly name: "arkiv" | "memory";
  publishWorld(
    manifest: Manifest,
    humanHash: string,
  ): Promise<{ worldKey: string; creationKey: string }>;
  listWorlds(limit: number): Promise<WorldSummary[]>;
  getWorld(worldKey: string): Promise<Manifest | undefined>;
  /** Live `creation` entities for one human: the daily quota count. */
  countCreations(humanHash: string): Promise<number>;
  /** When the oldest live creation expires, i.e. when the next slot opens. Null if none. */
  nextSlotAt(humanHash: string): Promise<Date | null>;
  /** Writes a short-lived `visit` entity and returns the live visit count. */
  recordVisit(worldKey: string): Promise<number>;
  recordAccusation(acc: Accusation, correct: boolean): Promise<void>;
  hasAccused(worldKey: string, humanHash: string): Promise<boolean>;
}
