/**
 * Server-side persistence for saved games: local asset files, Arkiv game
 * records (see `lib/arkiv.ts`), row mapping, and quota enforcement.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateScreen } from "@/lib/world-engine";
import { withRequestIds } from "@/lib/zg-client";
import { FREE_GAME_LIMIT, GEN_CALL_COST } from "@/lib/constants";
import { gameStore } from "@/lib/arkiv";
import type {
  FullGameResponse,
  GameListItem,
  GenerationQuota,
} from "@/lib/types/client";
import type {
  GameRecord,
  GameSceneRow,
  ParsedDataUrl,
  SessionUser,
  SavedScreenRequest,
} from "@/lib/types/server";
import type { SceneData } from "@/lib/universe";

// shortcut: generated images live on local disk, so they do not survive a redeploy or scale
//   past one server. Move them to 0G Storage (or any object store) before hosting publicly.
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
  const { bytes, ext } = parseDataUrl(dataUrl);
  const objectPath = relPath.includes(".") ? relPath : `${relPath}.${ext}`;
  const file = assetFilePath(objectPath);
  if (!file) throw new Error("Invalid asset path.");
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
export function toGameListItem(game: GameRecord): GameListItem {
  return {
    id: game.id,
    owner: game.owner,
    title: game.title,
    thumbnailUrl: game.thumbnail_url,
    createdAt: game.created_at,
  };
}

/**
 * Best-effort delete of all asset files under `{ownerId}/{gameId}/`.
 */
export async function deleteGameAssets(ownerId: string, gameId: string): Promise<void> {
  const dir = assetFilePath(`${ownerId}/${gameId}`);
  if (dir) await rm(dir, { recursive: true, force: true });
}

/**
 * Load a saved image and return raw base64 (no data-URL prefix).
 * Used when continuing screen generation from a saved asset URL. Only local
 * assets are read, so a client cannot make the server fetch arbitrary URLs.
 *
 * @param url - Saved asset URL (`/api/assets/...`).
 */
export async function fetchImageAsBase64(url: string): Promise<string | null> {
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
  if (!Number.isInteger(body.x) || !Number.isInteger(body.y) || Math.abs(body.x) > 1 || Math.abs(body.y) > 1) {
    throw Object.assign(new Error("The road ends at the edge of this 3x3 world."), { status: 422 });
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
    if (streets.length >= 9 || (sceneId !== "s0_0" && additional.length >= 8)) {
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
