import { bool, bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";

/**
 * Arkiv entity schemas. Documented for judges in arkiv/schema.md; keep the two in step.
 *
 * Every entity carries `project` and `entityType`, both indexed, so anyone can find this app's
 * data with `project = "<ARKIV_PROJECT_ID>" && entityType = "<type>"`. No names, wallets of
 * players, or prompts go in an entity: people appear only as a salted hash of their World ID
 * nullifier, and the mystery answer is sealed (encrypted) before it is written.
 */

const base = { project: str().indexed(), entityType: str().indexed() } as const;

export const WorldEntity = defineSchema({
  ...base,
  /** Unix ms. Indexed so the gallery can sort newest first on the node. */
  createdAt: u64().indexed(),
  /** Random id shared with the world's `creation` entity, so both can be written in one tx. */
  publishId: str().indexed().optional(),
  /** Short title for listings (Arkiv strings hold at most 128 bytes). */
  title: str(),
  /** Small JSON for gallery cards: { premise, thumbnailUrl }. Read without the full manifest. */
  summary: bytes(),
  /** Gzipped JSON of the public manifest: bible without the mystery, assets, map, doors, notes. */
  manifest: bytes(),
  /** AES-256-GCM sealed mystery (secret, culprit). Only this app's server can open it. */
  sealedMystery: bytes(),
});

export const CreationEntity = defineSchema({
  ...base,
  humanHash: str().indexed(),
  /** Matches the `publishId` of the world this creation produced. */
  publishId: str().indexed(),
});

export const VisitEntity = defineSchema({
  ...base,
  worldKey: str().indexed(),
});

export const AccusationEntity = defineSchema({
  ...base,
  worldKey: str().indexed(),
  humanHash: str().indexed(),
  /** Whether the guess was right. The named culprit is not stored, so the answer stays hidden. */
  correct: bool(),
});

/** Lifetimes. Expiry does the work a cron job would: quota windows, activity, cold cases. */
export const LIFETIME = {
  worldDays: 7,
  creationHours: 24,
  visitHours: 1,
  /** Accusations last as long as a case can, so the one-per-human rule holds for its life. */
  accusationDays: 30,
} as const;
