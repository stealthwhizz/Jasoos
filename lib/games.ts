/**
 * Server-side persistence for saved games: local asset files, Arkiv game
 * records (see `lib/arkiv.ts`), row mapping, and quota enforcement.
 */

import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, list, put } from "@vercel/blob";
import { generateScreen } from "@/lib/world-engine";
import { withRequestIds } from "@/lib/zg-client";
import { FREE_GAME_LIMIT, GEN_CALL_COST, MAX_STREET_SCREENS } from "@/lib/constants";
import { gameStore } from "@/lib/arkiv";
import { withRetry, DEFAULT_RETRY_OPTS } from "@/lib/retry";
import type {
  FullGameResponse,
  GameListItem,
  GenerationQuota,
  VoteTally,
  VoteValue,
} from "@/lib/types/client";
import type {
  GameRecord,
  GameSceneRow,
  ParsedDataUrl,
  SessionUser,
  SavedScreenRequest,
  Vote,
} from "@/lib/types/server";
import type { SceneData } from "@/lib/universe";

// Generated images live on local disk by default (dev, or one server with a volume). On Vercel the
// disk does not persist, so when BLOB_READ_WRITE_TOKEN is set they go to Vercel Blob instead.
/** True when assets are stored in Vercel Blob rather than on local disk. */
const blobStorageOn = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
/** Only Vercel Blob's public host is ever fetched server-side, so a client cannot make us fetch any URL. */
const BLOB_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;
/** Where generated game assets are written. Served by `GET /api/assets/[...path]`. */
const ASSET_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.ASSET_DIR || ".data/assets");
/** URL prefix for saved assets. */
const ASSET_URL_PREFIX = "/api/assets/";

/**
 * Derive total AI generation calls from persisted assets.
 * Must stay in sync with `GEN_CALL_COST` and client `addCalls` sites.
 *
 * @param game - Parent game row (sprite + finales).
 * @param scenes - Saved scene rows or client scene list (only `kind` is read).
 */
export function computeGenCallsFromAssets(
  game: Pick<GameRecord, "sprite_url" | "finale" | "sealed_victory">,
  scenes: Array<Pick<GameSceneRow, "kind">>
): number {
  const streetCount = scenes.filter((s) => s.kind === "street").length;
  const interiorCount = scenes.filter((s) => s.kind === "interior").length;
  let total = GEN_CALL_COST.universe;
  total += streetCount * GEN_CALL_COST.screen;
  total += interiorCount * GEN_CALL_COST.interior;
  if (game.sprite_url) total += GEN_CALL_COST.sprite;
  if (game.sealed_victory) total += GEN_CALL_COST.finale;
  if (game.finale?.defeat) total += GEN_CALL_COST.finale;
  return total;
}

/**
 * Map file extension from a MIME type string.
 * @param mimeType - MIME type from a data URL.
 */
function mimeToExt(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("wav")) return "wav";
  return "bin";
}

/**
 * Parse a `data:mime;base64,...` URL into raw bytes for saving.
 * @param dataUrl - Inline data URL from 0G generation.
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL.");
  }
  const mimeType = match[1];
  const bytes = new Uint8Array(Buffer.from(match[2], "base64"));
  return { mimeType, bytes, ext: mimeToExt(mimeType) };
}

/**
 * Resolve an asset path inside ASSET_DIR. Returns null for anything that would escape it.
 * @param relPath - Path below the asset root, e.g. `owner/game/image.png`.
 */
export function assetFilePath(relPath: string): string | null {
  const full = path.resolve(ASSET_DIR, relPath);
  return full.startsWith(ASSET_DIR + path.sep) ? full : null;
}

/**
 * Save a data URL under the asset root and return its URL.
 * Overwrites, so repeated saves of the same scene replace the old file.
 *
 * @param relPath - Asset path without extension (extension inferred from MIME).
 * @param dataUrl - Inline image/audio data URL.
 */
export async function uploadDataUrl(relPath: string, dataUrl: string): Promise<string> {
  const { bytes, ext, mimeType } = parseDataUrl(dataUrl);
  const objectPath = relPath.includes(".") ? relPath : `${relPath}.${ext}`;
  const file = assetFilePath(objectPath);
  if (!file) throw new Error("Invalid asset path.");
  if (blobStorageOn()) {
    const blob = await withRetry(() => put(objectPath, Buffer.from(bytes), {
      access: "public",
      contentType: mimeType,
      // Same path on purpose: a re-saved scene replaces its image. Short cache so replays see it.
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    }), DEFAULT_RETRY_OPTS);
    return blob.url;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return `${ASSET_URL_PREFIX}${objectPath}`;
}

/**
 * Strip inline image fields from a client `SceneData` for the `data` jsonb column.
 * @param scene - Full scene from generation or client state.
 */
export function sceneToRow(scene: SceneData): Omit<GameSceneRow, "id" | "game_id"> {
  const { image, annotated, ...data } = scene;
  void image;
  void annotated;
  return {
    scene_id: scene.id,
    kind: scene.kind,
    x: scene.coord?.x ?? null,
    y: scene.coord?.y ?? null,
    data,
    image_url: "",
    annotated_url: null,
  };
}

/**
 * Reconstruct a client `SceneData` from a saved row + asset URLs.
 * @param row - Saved scene row.
 */
export function rowToScene(row: GameSceneRow): SceneData {
  return {
    ...row.data,
    id: row.scene_id,
    kind: row.kind,
    image: row.image_url,
    annotated: row.annotated_url ?? undefined,
    coord:
      row.x !== null && row.y !== null ? { x: row.x, y: row.y } : row.data.coord,
  };
}

/** Player ids (World ID hashes) that bypass `FREE_GAME_LIMIT`, from `UNLIMITED_PLAYERS`. */
const UNLIMITED_PLAYERS = new Set(
  (process.env.UNLIMITED_PLAYERS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);

/**
 * Count how many worlds the player has created and whether they may create another.
 * Respects `FREE_GAME_LIMIT` and `UNLIMITED_PLAYERS`.
 *
 * @param userId - Signed-in player id.
 */
export async function getGenerationQuota(userId: string): Promise<GenerationQuota> {
  const used = await gameStore().countGames(userId);
  const unlimited = UNLIMITED_PLAYERS.has(userId);
  const limit = FREE_GAME_LIMIT;
  const canCreate = unlimited || used < limit;

  return { used, limit, unlimited, canCreate };
}

/**
 * Ensure the user is allowed to create a new game; throws with `status: 403` if not.
 * @param user - Signed-in player.
 */
export async function assertCanCreate(user: SessionUser): Promise<GenerationQuota> {
  const quota = await getGenerationQuota(user.id);
  if (!quota.canCreate) {
    const message =
      quota.limit === 0
        ? "Creating new worlds is currently disabled."
        : "You have reached your free world limit.";
    const err = new Error(message) as Error & { status: number };
    err.status = 403;
    throw err;
  }
  return quota;
}

/**
 * Fetch a single game row by id.
 * @param id - Game id (Arkiv entity key).
 */
export async function getGameRecord(id: string): Promise<GameRecord | null> {
  return gameStore().getGame(id);
}

/**
 * Load a game and verify the caller owns it.
 * @throws Error with `status` 404 or 403 when missing or forbidden.
 */
export async function assertGameOwner(gameId: string, userId: string): Promise<GameRecord> {
  const game = await getGameRecord(gameId);
  if (!game) {
    const err = new Error("Game not found.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (game.owner !== userId) {
    const err = new Error("Forbidden.") as Error & { status: number };
    err.status = 403;
    throw err;
  }
  return game;
}

/**
 * List all saved scenes for a game, oldest first.
 * @param gameId - Parent game id.
 */
export async function listGameScenes(gameId: string): Promise<GameSceneRow[]> {
  return gameStore().listScenes(gameId);
}

/**
 * Assemble the full game payload returned by `GET /api/games/[id]`.
 * @param game - Parent game row.
 * @param userId - Current user (used to set `isOwner`).
 */
export async function buildFullGameResponse(
  game: GameRecord,
  userId: string
): Promise<FullGameResponse> {
  const sceneRows = await listGameScenes(game.id);
  return {
    id: game.id,
    owner: game.owner,
    isOwner: game.owner === userId,
    title: game.title,
    idea: game.idea,
    bible: game.bible,
    premise: game.premise,
    spriteUrl: game.sprite_url,
    finales: game.finale ?? {},
    scenes: sceneRows.map(rowToScene),
    genCalls: computeGenCallsFromAssets(game, sceneRows),
    createdAt: game.created_at,
  };
}

/**
 * Convert a game record to the list-item shape for `GET /api/games`.
 * @param game - Full game record.
 */
export function toGameListItem(game: GameRecord, votes: VoteTally = NO_VOTES): GameListItem {
  return {
    id: game.id,
    owner: game.owner,
    title: game.title,
    thumbnailUrl: game.thumbnail_url,
    createdAt: game.created_at,
    visibility: game.visibility ?? "public",
    votes,
  };
}

const NO_VOTES: VoteTally = { up: 0, down: 0, mine: 0 };

/** Public worlds are open to every signed-in human; private ones only to their owner. */
export function canViewGame(game: GameRecord, userId: string): boolean {
  return game.visibility !== "private" || game.owner === userId;
}

/**
 * Totals likes and dislikes per world and marks the viewer's own vote.
 * @param votes - Every stored vote (at most one per human per world).
 * @param userId - The viewer, whose vote fills `mine`.
 */
export function tallyVotes(votes: Vote[], userId: string): Map<string, VoteTally> {
  const tallies = new Map<string, VoteTally>();
  for (const vote of votes) {
    const tally = tallies.get(vote.gameId) ?? { ...NO_VOTES };
    if (vote.value === 1) tally.up++;
    else tally.down++;
    if (vote.humanHash === userId) tally.mine = vote.value;
    tallies.set(vote.gameId, tally);
  }
  return tallies;
}

/**
 * The worlds this player may see, newest first, each with its vote tally. Other players'
 * private worlds are left out entirely.
 */
export async function listVisibleGames(userId: string, ownerOnly = false): Promise<GameListItem[]> {
  const store = gameStore();
  const [games, votes] = await Promise.all([store.listGames(ownerOnly ? userId : undefined), store.listVotes()]);
  const tallies = tallyVotes(votes, userId);
  const visible = games.filter((game) => canViewGame(game, userId));
  // Hide worlds whose first screen is not stored here: opening one could only bounce the player back.
  const playable = await Promise.all(visible.map((game) => assetAvailable(game.thumbnail_url)));
  return visible.filter((_, i) => playable[i]).map((game) => toGameListItem(game, tallies.get(game.id)));
}

/**
 * Records one human's like/dislike (0 withdraws it) and returns the world's new tally.
 * @throws Error with `status` 404 when the world is missing or private to someone else,
 *   403 when the owner votes on their own world (no boosting yourself).
 */
export async function voteOnGame(gameId: string, userId: string, value: VoteValue): Promise<VoteTally> {
  const game = await getGameRecord(gameId);
  if (!game || !canViewGame(game, userId)) {
    throw Object.assign(new Error("Game not found."), { status: 404 });
  }
  if (game.owner === userId) {
    throw Object.assign(new Error("You can't vote on your own world."), { status: 403 });
  }
  const store = gameStore();
  await store.castVote(gameId, userId, value);
  // Tally from the other votes plus this one, so a lagging read cannot show the old vote.
  const others = (await store.listVotes()).filter((v) => !(v.gameId === gameId && v.humanHash === userId));
  const mine: Vote[] = value === 0 ? [] : [{ gameId, humanHash: userId, value }];
  return tallyVotes([...others, ...mine], userId).get(gameId) ?? { ...NO_VOTES };
}

/**
 * Best-effort delete of all asset files under `{ownerId}/{gameId}/`.
 */
export async function deleteGameAssets(ownerId: string, gameId: string): Promise<void> {
  if (blobStorageOn()) {
    const { blobs } = await list({ prefix: `${ownerId}/${gameId}/` });
    if (blobs.length) await del(blobs.map((b) => b.url));
    return;
  }
  const dir = assetFilePath(`${ownerId}/${gameId}`);
  if (dir) await rm(dir, { recursive: true, force: true });
}

/**
 * Whether a saved image can be served by this deployment. Arkiv shares world records with every
 * server, but images saved before Blob storage sit on the disk of the machine that made them, so
 * on any other server their `/api/assets/...` URL is a 404. Blob and other remote URLs count as
 * available; null (world not built yet) is left to the owner's boot flow.
 */
export async function assetAvailable(url: string | null): Promise<boolean> {
  if (!url || !url.startsWith(ASSET_URL_PREFIX)) return true;
  const file = assetFilePath(decodeURIComponent(url.slice(ASSET_URL_PREFIX.length)));
  if (!file) return false;
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a saved image and return raw base64 (no data-URL prefix).
 * Used when continuing screen generation from a saved asset URL. Only local
 * assets and Vercel Blob URLs are read, so a client cannot make the server fetch arbitrary URLs.
 *
 * @param url - Saved asset URL (`/api/assets/...` or a Vercel Blob URL).
 */
export async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (BLOB_URL.test(url)) {
    try {
      const res = await withRetry(() => fetch(url), DEFAULT_RETRY_OPTS);
      return res.ok ? Buffer.from(await res.arrayBuffer()).toString("base64") : null;
    } catch {
      return null;
    }
  }
  if (!url.startsWith(ASSET_URL_PREFIX)) return null;
  const file = assetFilePath(decodeURIComponent(url.slice(ASSET_URL_PREFIX.length)));
  if (!file) return null;
  try {
    return (await readFile(file)).toString("base64");
  } catch {
    return null;
  }
}


// One process owns the signer; keep a world's generation + save together so concurrent
// requests cannot spend credits on the same screen or race the world's capacity check.
const screenGenerations = new Map<string, Promise<unknown>>();

/** Replay or generate and persist a bounded screen using only the saved world's bible. */
export async function getOrGenerateScreen(body: SavedScreenRequest, user: SessionUser) {
  if (typeof body?.gameId !== "string" || !body.gameId) {
    throw Object.assign(new Error("gameId is required."), { status: 422 });
  }
  // The overworld is unbounded; MAX_STREET_SCREENS caps how much of it a world generates.
  if (!Number.isInteger(body.x) || !Number.isInteger(body.y)) {
    throw Object.assign(new Error("Screen coordinates must be whole numbers."), { status: 422 });
  }
  const previous = screenGenerations.get(body.gameId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const store = gameStore();
    const game = await getGameRecord(body.gameId);
    if (!game) throw Object.assign(new Error("Game not found."), { status: 404 });
    const scenes = await store.listScenes(game.id);
    const sceneId = `s${body.x}_${body.y}`;
    const cached = scenes.find((scene) => scene.scene_id === sceneId && scene.kind === "street");
    if (cached) return { scene: rowToScene(cached), generated: false, requestIds: [] };
    if (game.owner !== user.id) throw Object.assign(new Error("Only the creator can build new roads."), { status: 403 });
    const streets = scenes.filter((scene) => scene.kind === "street");
    const additional = streets.filter((scene) => scene.scene_id !== "s0_0");
    if (streets.length >= MAX_STREET_SCREENS || (sceneId !== "s0_0" && additional.length >= MAX_STREET_SCREENS - 1)) {
      throw Object.assign(new Error("This world has reached its eight additional screen limit."), { status: 422 });
    }
    const placed = new Set(streets.flatMap((scene) => scene.data.hotspots
      .filter((hotspot) => hotspot.kind === "building" && typeof hotspot.clueIndex === "number")
      .map((hotspot) => hotspot.clueIndex)));
    const unplaced = [0, 1, 2].filter((index) => !placed.has(index));
    const direction = body.arriveFrom && ["n", "e", "s", "w"].includes(body.arriveFrom) ? body.arriveFrom : null;
    // Continuity comes from this world's saved neighbour, never a client-provided image/bible.
    const dx = direction === "e" ? 1 : direction === "w" ? -1 : 0;
    const dy = direction === "s" ? 1 : direction === "n" ? -1 : 0;
    const neighbour = direction ? streets.find((scene) => scene.x === body.x - dx && scene.y === body.y - dy) : undefined;
    const image = neighbour ? await fetchImageAsBase64(neighbour.image_url) : null;
    const { result: scene, requestIds } = await withRequestIds(() =>
      generateScreen(game.bible, body.x, body.y, direction, image, unplaced.slice(0, 1))
    );
    const base = `${game.owner}/${game.id}/${sceneId}`;
    const imageUrl = scene.image.startsWith("data:") ? await uploadDataUrl(`${base}/image`, scene.image) : scene.image;
    const annotatedUrl = scene.annotated?.startsWith("data:")
      ? await uploadDataUrl(`${base}/annotated`, scene.annotated) : scene.annotated;
    const row = sceneToRow({ ...scene, id: sceneId, kind: "street", coord: { x: body.x, y: body.y }, image: imageUrl, annotated: annotatedUrl });
    const saved = await store.upsertScene(game.id, row);
    if (sceneId === "s0_0") await store.updateGame(game.id, { thumbnail_url: imageUrl });
    return { scene: rowToScene(saved.row), generated: true, requestIds };
  });
  screenGenerations.set(body.gameId, run);
  try { return await run; }
  finally { if (screenGenerations.get(body.gameId) === run) screenGenerations.delete(body.gameId); }
}
