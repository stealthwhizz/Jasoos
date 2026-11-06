/**
 * Server-side types for ETH Jasoos.
 *
 * Database row shapes, API route request bodies, and internal helpers belong
 * here. Route handlers and `lib/games.ts` import from this module.
 */

import type { Direction } from "../world-engine";
import type {
  CreateGameRequest,
  FinaleData,
  FinaleOutcome,
  FullGameResponse,
  GameListItem,
  GenerationQuota,
} from "./client";
import type { Premise } from "./shared";
import type { GameBible, SceneData } from "../universe";

/** Re-export API response shapes the server produces (single source in client). */
export type {
  CreateGameRequest,
  FinaleData,
  FinaleOutcome,
  FullGameResponse,
  GameListItem,
  GenerationQuota,
};

/** Alias: server-side name for the create-game POST body. */
export type CreateGameBody = CreateGameRequest;

/** The signed-in player. `id` is a salted hash of their World ID nullifier. */
export type SessionUser = { id: string };

/** Saved game record (snake_case kept from the original table columns). */
export type GameRecord = {
  id: string;
  owner: string;
  title: string;
  idea: string;
  bible: GameBible;
  premise: Premise;
  sprite_url: string | null;
  /** Only `defeat` is stored here; the victory finale spells out the secret, see `sealed_victory`. */
  finale: Partial<Record<FinaleOutcome, FinaleData>>;
  /** Victory `FinaleData`, sealed; `/api/finale` saves it after the owner's first correct accusation. */
  sealed_victory?: string;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
};

/** Saved scene record. */
export type GameSceneRow = {
  id: string;
  game_id: string;
  scene_id: string;
  kind: "street" | "interior";
  x: number | null;
  y: number | null;
  /** Scene metadata without inline image fields (images live in the asset store). */
  data: Omit<SceneData, "image" | "annotated">;
  image_url: string;
  annotated_url: string | null;
};

/** PUT `/api/games/[id]/sprite` request body. */
export type PutSpriteBody = {
  sprite: string;
};

/** PUT `/api/games/[id]/finales/[outcome]` request body. */
export type PutFinaleBody = FinaleData;

/** Parsed data URL ready to save to the asset store. */
export type ParsedDataUrl = {
  mimeType: string;
  bytes: Uint8Array;
  ext: string;
};

/** Next.js App Router context for `/api/games/[id]`. */
export type GameIdRouteContext = {
  params: Promise<{ id: string }>;
};

/** Next.js App Router context for `/api/games/[id]/scenes/[sceneId]`. */
export type GameSceneRouteContext = {
  params: Promise<{ id: string; sceneId: string }>;
};

/** Next.js App Router context for `/api/games/[id]/finales/[outcome]`. */
export type FinaleRouteContext = {
  params: Promise<{ id: string; outcome: string }>;
};

/** POST `/api/screen` request body. */
export type ScreenRequest = {
  bible: GameBible;
  x: number;
  y: number;
  /** Direction the player walked to reach this screen. */
  arriveFrom?: Direction | null;
  /** Previous screen frame as raw base64 (no data-URL prefix). */
  prevImage?: string | null;
  /** Previous screen public URL — fetched server-side when `prevImage` is absent. */
  prevImageUrl?: string | null;
  /** Bible rooms (0–2) not yet placed anywhere in the world. */
  unplacedRooms?: number[];
};

/** POST `/api/sprite` request body. */
export type SpriteRequest = {
  premise: Premise;
  referenceFrame?: string | null;
  /** Reference frame public URL — fetched server-side when `referenceFrame` is absent. */
  referenceFrameUrl?: string | null;
};
