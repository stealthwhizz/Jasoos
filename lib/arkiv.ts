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
import { and, asc, desc, eq, or } from "@arkiv-network/sdk/query";
import { bool, bytes, defineSchema, i32, str, u64 } from "@arkiv-network/sdk/schema";
import { hexToBytes, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withRetry, DEFAULT_RETRY_OPTS } from "@/lib/retry";
import { MAX_STREET_SCREENS } from "@/lib/constants";
import type { Accusation, GameRecord, GameSceneRow, Vote, VoteValue } from "@/lib/types/server";

/** Fields set when a game is created; the rest are filled in by the store. */
export type NewGame = Pick<GameRecord, "owner" | "title" | "idea" | "bible" | "premise">;
/** Fields that change after creation. */
export type GamePatch = Partial<
  Pick<GameRecord, "sprite_url" | "finale" | "thumbnail_url" | "sealed_victory" | "visibility">
>;
/** A scene as saved, before the store assigns ids. */
export type NewScene = Omit<GameSceneRow, "id" | "game_id">;

/** What routes need from persistence. */
export interface GameStore {
  /**
   * Records this human's accusation, or returns the one already on record. Check and write share
   * the signer queue, so concurrent requests cannot both record. `accused` is the suspect on record.
   */
  recordAccusation(accusation: Accusation): Promise<{ accused: number; created: boolean }>;
  /** Returning unlockers need no second World ID proof. */
  hasUnlock(worldKey: string, humanHash: string): Promise<boolean>;
  /** Idempotently persists an evidence unlock before returning its key. */
  unlockEvidence(worldKey: string, humanHash: string): Promise<void>;
  /** Live evidence opens for this world. */
  countUnlocks(worldKey: string): Promise<number>;
  readonly name: "arkiv" | "memory";
  /**
   * Sets this human's vote on a world, replacing any earlier one; 0 removes it. Shares the signer
   * queue so double clicks cannot leave two votes for one human.
   */
  castVote(gameId: string, humanHash: string, value: VoteValue): Promise<void>;
  /** Every vote in this project, for tallying the gallery. */
  listVotes(): Promise<Vote[]>;
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

/** The most rows an Arkiv node returns in one page. Asking for more fails the whole query. */
const PAGE_SIZE = 100;

/** A query that can be paged. Arkiv's select builders fit this shape. */
interface Pageable {
  limit(n: number): this;
  offset(n: number): this;
  fetch(): Promise<{ entities: readonly unknown[] }>;
}
type RowOf<Q extends Pageable> = Awaited<ReturnType<Q["fetch"]>>["entities"][number];

/** Reads up to `max` rows, one page of at most PAGE_SIZE at a time. Sort the query first. */
async function fetchUpTo<Q extends Pageable>(query: Q, max = Number.POSITIVE_INFINITY): Promise<RowOf<Q>[]> {
  const rows: RowOf<Q>[] = [];
  while (rows.length < max) {
    const size = Math.min(PAGE_SIZE, max - rows.length);
    const page = await withRetry(() => query.limit(size).offset(rows.length).fetch(), DEFAULT_RETRY_OPTS);
    rows.push(...page.entities as RowOf<Q>[]);
    if (page.entities.length < size) break;
  }
  return rows;
}
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

const ScreenEntity = defineSchema({
  ...base, gameId: str().indexed(), sceneId: str().indexed(), createdAt: u64().indexed(),
  worldKey: str().indexed(), x: i32().indexed(), y: i32().indexed(), data: bytes(), record: bytes(),
});

const UnlockEntity = defineSchema({ ...base, worldKey: str().indexed(), humanHash: str().indexed() });
/** One human's like (+1) or dislike (-1) on a world; at most one per human per world. */
const VoteEntity = defineSchema({ ...base, gameId: str().indexed(), humanHash: str().indexed(), value: i32() });
const AccusationEntity = defineSchema({
  ...base, gameId: str().indexed(), humanHash: str().indexed(), accused: u64(), correct: bool(),
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

  let sceneQueue: Promise<unknown> = Promise.resolve();
  const serialScene = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = sceneQueue.then(fn, fn);
    sceneQueue = run.catch(() => undefined);
    return run;
  };
  const scope = (entityType: string) => and(eq("project", project), eq("entityType", entityType));
  const toGame = (key: string, hex: Hex): GameRecord => ({ ...unpack<Omit<GameRecord, "id">>(hex), id: key });

  async function findScene(gameId: string, sceneId: string) {
    const page = await reader
      .select({ $key: true })
      .from(SceneEntity)
      .where(and(or(scope("scene"), scope("screen")), eq("gameId", gameId), eq("sceneId", sceneId)))
      .limit(1)
      .fetch();
    return page.entities[0]?.$key as Hex | undefined;
  }

  return {
    name: "arkiv",
    async recordAccusation(accusation) {
      // Keep check + write in the same queue: concurrent requests cannot both win the check.
      return serial(async () => {
        const page = await withRetry(() => reader.select({ accused: true }).from(AccusationEntity).where(and(
          scope("accusation"), eq("gameId", accusation.gameId), eq("humanHash", accusation.humanHash)
        )).limit(1).fetch(), DEFAULT_RETRY_OPTS);
        const existing = page.entities[0];
        if (existing) return { accused: Number(existing.accused.value), created: false };
        await withRetry(() => writer.createEntity(AccusationEntity, {
          project, entityType: "accusation", ...accusation, accused: u64(accusation.accused),
        }, { expiration: ExpirationTime.fromDays(GAME_DAYS) }), DEFAULT_RETRY_OPTS);
        return { accused: accusation.accused, created: true };
      });
    },
    async castVote(gameId, humanHash, value) {
      await serial(async () => {
        const page = await withRetry(() => reader.select({ $key: true }).from(VoteEntity).where(and(
          scope("vote"), eq("gameId", gameId), eq("humanHash", humanHash)
        )).limit(1).fetch(), DEFAULT_RETRY_OPTS);
        const existing = page.entities[0]?.$key as Hex | undefined;
        if (value === 0) {
          if (existing) await withRetry(() => writer.deleteEntity({ entityKey: existing }), DEFAULT_RETRY_OPTS);
          return;
        }
        // Changing a vote patches the same entity, so one human never counts twice.
        await withRetry(() => existing
          ? writer.patchEntity(VoteEntity, existing, { set: { value: i32(value) } })
          : writer.createEntity(VoteEntity, { project, entityType: "vote", gameId, humanHash, value: i32(value) },
            { expiration: ExpirationTime.fromDays(GAME_DAYS) }), DEFAULT_RETRY_OPTS);
      });
    },
    async listVotes() {
      const rows = await fetchUpTo(reader.select({ gameId: true, humanHash: true, value: true })
        .from(VoteEntity).where(scope("vote")).orderBy(asc("$key")));
      return rows.flatMap((row) => {
        const value = Number(row.value.value);
        return value === 1 || value === -1
          ? [{ gameId: String(row.gameId.value), humanHash: String(row.humanHash.value), value }]
          : [];
      });
    },
    async hasUnlock(worldKey, humanHash) {
      return (await withRetry(() => reader.count().from(UnlockEntity).where(and(
        scope("unlock"), eq("worldKey", worldKey), eq("humanHash", humanHash)
      )).fetch(), DEFAULT_RETRY_OPTS)) > BigInt(0);
    },
    async unlockEvidence(worldKey, humanHash) {
      await serial(async () => {
        if (await this.hasUnlock(worldKey, humanHash)) return;
        await withRetry(() => writer.createEntity(UnlockEntity, {
          project, entityType: "unlock", worldKey, humanHash,
        }, { expiration: ExpirationTime.fromDays(GAME_DAYS) }), DEFAULT_RETRY_OPTS);
      });
    },
    async countUnlocks(worldKey) {
      return Number(await withRetry(() => reader.count().from(UnlockEntity).where(and(scope("unlock"), eq("worldKey", worldKey))).fetch(), DEFAULT_RETRY_OPTS));
    },

    async listGames(owner) {
      const rows = await fetchUpTo(
        reader
          .select({ $key: true, record: true })
          .from(GameEntity)
          .where(owner ? and(scope("game"), eq("owner", owner)) : scope("game"))
          .orderBy(desc("createdAt"))
      );
      return rows.map((row) => toGame(row.$key, row.record.value));
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
      // Collect every scene key first, then delete, so deletes cannot shift the pages.
      const scenes = await fetchUpTo(
        reader
          .select({ $key: true })
          .from(SceneEntity)
          .where(and(or(scope("scene"), scope("screen")), eq("gameId", id)))
          .orderBy(asc("$key"))
      );
      for (const s of scenes) {
        await write(() => writer.deleteEntity({ entityKey: s.$key as Hex }));
      }
      if (isEntityKey(id)) await write(() => writer.deleteEntity({ entityKey: id as Hex }));
    },

    async listScenes(gameId) {
      const rows = await fetchUpTo(
        reader
          .select({ $key: true, record: true })
          .from(SceneEntity)
          .where(and(or(scope("scene"), scope("screen")), eq("gameId", gameId)))
          .orderBy(asc("createdAt"))
      );
      return rows.map((row) => ({
        ...unpack<NewScene>(row.record.value),
        id: row.$key,
        game_id: gameId,
      }));
    },

    async upsertScene(gameId, scene) {
      return serialScene(async () => {
        const current = await this.listScenes(gameId);
        assertScreenCapacity(current, scene);
        const existing = await findScene(gameId, scene.scene_id);
        if (existing) {
          await write(() =>
            scene.kind === "street"
              ? writer.patchEntity(ScreenEntity, existing, { set: { record: pack(scene), data: pack(scene.data) } })
              : writer.patchEntity(SceneEntity, existing, { set: { record: pack(scene) } })
          );
          return { row: { ...scene, id: existing, game_id: gameId }, created: false };
        }
        const common = { project, gameId, sceneId: scene.scene_id, createdAt: u64(Date.now()), record: pack(scene) };
        const { entityKey } = await write(() => scene.kind === "street"
          ? writer.createEntity(ScreenEntity, {
            ...common, entityType: "screen", worldKey: gameId,
            x: i32(scene.x ?? 0), y: i32(scene.y ?? 0), data: pack(scene.data),
          }, { expiration: ExpirationTime.fromDays(GAME_DAYS) })
          : writer.createEntity(SceneEntity, { ...common, entityType: "scene" },
            { expiration: ExpirationTime.fromDays(GAME_DAYS) })
        );
        return { row: { ...scene, id: entityKey, game_id: gameId }, created: true };
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* In-memory stand-in                                                  */
/* ------------------------------------------------------------------ */

function createMemoryStore(): GameStore {
  const games = new Map<string, GameRecord>();
  const scenes = new Map<string, GameSceneRow[]>();
  const accusations = new Map<string, Accusation>();
  const unlocks = new Map<string, Set<string>>();
  const votes = new Map<string, Vote>();
  return {
    name: "memory",
    async castVote(gameId, humanHash, value) {
      const key = `${gameId}:${humanHash}`;
      if (value === 0) votes.delete(key);
      else votes.set(key, { gameId, humanHash, value });
    },
    async listVotes() { return [...votes.values()]; },
    async recordAccusation(accusation) {
      const key = `${accusation.gameId}:${accusation.humanHash}`;
      const existing = accusations.get(key);
      if (existing) return { accused: existing.accused, created: false };
      accusations.set(key, accusation);
      return { accused: accusation.accused, created: true };
    },
    async hasUnlock(worldKey, humanHash) { return unlocks.get(worldKey)?.has(humanHash) ?? false; },
    async unlockEvidence(worldKey, humanHash) {
      const humans = unlocks.get(worldKey) ?? new Set<string>();
      humans.add(humanHash);
      unlocks.set(worldKey, humans);
    },
    async countUnlocks(worldKey) { return unlocks.get(worldKey)?.size ?? 0; },
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
      assertScreenCapacity(list, scene);
      const i = list.findIndex((s) => s.scene_id === scene.scene_id);
      const row: GameSceneRow = { ...scene, id: list[i]?.id ?? randomUUID(), game_id: gameId };
      if (i >= 0) list[i] = row;
      else list.push(row);
      scenes.set(gameId, list);
      return { row, created: i < 0 };
    },
  };
}

/** Reject extra screens at persistence too, so direct save requests cannot bypass the cap. */
function assertScreenCapacity(scenes: GameSceneRow[], scene: NewScene): void {
  if (scene.kind !== "street") return;
  // The overworld is unbounded; only the id must match its grid cell.
  if (!Number.isInteger(scene.x) || !Number.isInteger(scene.y) || scene.scene_id !== `s${scene.x}_${scene.y}`) {
    throw Object.assign(new Error("Screen id must match its grid coordinate."), { status: 422 });
  }
  const streets = scenes.filter((s) => s.kind === "street").length;
  if (!scenes.some((s) => s.scene_id === scene.scene_id) && streets >= MAX_STREET_SCREENS) {
    throw Object.assign(new Error("This world has reached its eight additional screen limit."), { status: 422 });
  }
}

const globalStore = globalThis as unknown as { __ETHJasoosGameStore?: GameStore };

/** The process-wide store: Arkiv when ARKIV_SIGNER_KEY is set, memory otherwise. */
export function gameStore(): GameStore {
  const key = process.env.ARKIV_SIGNER_KEY;
  globalStore.__ETHJasoosGameStore ??= key ? createArkivStore(key) : createMemoryStore();
  return globalStore.__ETHJasoosGameStore;
}
