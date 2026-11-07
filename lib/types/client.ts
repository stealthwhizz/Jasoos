/**
 * Client-side types for Jasoos.
 *
 * All types consumed by React components, client pages, and fetch calls belong
 * here. Do not define duplicate shapes in component files.
 */

import type { Choice, Effects, EndingKind, Stats } from "../stats";
import type { DialogueTurn, GameBible, SceneData } from "../universe";
import type { Premise, ZgRequest } from "./shared";

/** Premise card / world metadata shown in the UI. */
export type { Premise, ZgRequest } from "./shared";

/** Generation routes return the 0G request IDs of the model calls they made. */
export type ZgTraced = { requestIds?: ZgRequest[] };

/** A note in the world; `text` may hide a codebook message for the Decoder. */
export type Note = {
  text: string;
};

/** One completed story beat for legacy linear mode context. */
export type HistoryEntry = {
  caption: string;
  choice: string;
};

/** Legacy linear-mode turn request (client → `/api/turn`). */
export type TurnRequest = {
  premise: Premise;
  history: HistoryEntry[];
  /** The option the player just picked. null on the opening turn. */
  choice: string | null;
  /** Previous frame (base64, no data-url prefix) for visual continuity. */
  prevImage: string | null;
  stats: Stats;
  /** Current time budget 0..100. */
  clock: number;
  /** Current journey progress 0..100. */
  progress: number;
};

/** Legacy linear-mode turn response. */
export type TurnResponse = {
  caption: string;
  outcomeFlash: string;
  choices: Choice[];
  /** Fully-formed data URL for the scene image. */
  image: string;
  effects: Effects;
  timeCost: number;
  location: string;
  progress: number;
  isEnding: boolean;
  endingKind?: EndingKind;
  endingTitle?: string;
};

/** Client-side record of a single legacy story frame. */
export type Scene = {
  turn: number;
  image: string;
  caption: string;
  outcomeFlash: string;
  choices: Choice[];
  effects: Effects;
  timeCost: number;
  location: string;
  progress: number;
  isEnding: boolean;
  endingKind?: EndingKind;
  endingTitle?: string;
  /** The choice the player made to leave this scene. */
  chosen?: string;
};

/* ------------------------------------------------------------------ */
/* Game persistence API (client ↔ `/api/games`, `/api/profile`)       */
/* ------------------------------------------------------------------ */

/** Victory or defeat ending variant. */
export type FinaleOutcome = "victory" | "defeat";

/** Generated ending narration + image (inline data URL or Storage URL). */
export type FinaleData = {
  title: string;
  resolution: string;
  image: string;
  outcome?: FinaleOutcome;
};

/** Summary row returned by `GET /api/games`. */
export type GameListItem = {
  id: string;
  owner: string;
  title: string;
  thumbnailUrl: string | null;
  createdAt: string;
  /** Private worlds are listed only to their owner. */
  visibility: WorldVisibility;
  /** Community likes and dislikes; one vote per verified human. */
  votes: VoteTally;
};

/** Who can find a world. Worlds saved before this field existed count as public. */
export type WorldVisibility = "public" | "private";

/** One human's vote on a world: 1 like, -1 dislike, 0 no vote. */
export type VoteValue = 1 | -1 | 0;

/** Vote totals for a world plus the viewer's own vote. */
export type VoteTally = { up: number; down: number; mine: VoteValue };

/** `PATCH /api/games/[id]` body: the owner changes who can see the world. */
export type UpdateGameRequest = { visibility: WorldVisibility };

/** `PUT /api/games/[id]/vote` body. Sending 0 withdraws the vote. */
export type VoteRequest = { value: VoteValue };

/** Free-tier world creation limits for the signed-in user. */
export type GenerationQuota = {
  used: number;
  limit: number;
  unlimited: boolean;
  canCreate: boolean;
};

/** Response from `GET /api/profile`. */
export type ProfileResponse = {
  /** Signed-in player id (hash of their World ID nullifier). */
  userId: string;
  generation: GenerationQuota;
};

/** Full saved game returned by `GET /api/games/[id]`. */
export type FullGameResponse = {
  id: string;
  owner: string;
  /** True when the current user owns this game and may generate new scenes. */
  isOwner: boolean;
  title: string;
  idea: string;
  bible: GameBible;
  premise: Premise;
  spriteUrl: string | null;
  finales: Partial<Record<FinaleOutcome, FinaleData>>;
  scenes: SceneData[];
  /** Total AI generation calls derived from persisted assets (same for owner and visitors). */
  genCalls: number;
  createdAt: string;
};

/** Body sent by the client when creating a new game row. */
export type CreateGameRequest = {
  idea: string;
  bible: GameBible;
  premise: Premise;
};

/** Response from `POST /api/games`. */
export type CreateGameResponse = GameListItem;

/** Response from `PUT /api/games/[id]/sprite`. */
export type PutSpriteResponse = {
  spriteUrl: string;
};

/* ------------------------------------------------------------------ */
/* World component                                                      */
/* ------------------------------------------------------------------ */

/** Whether the world is being created fresh or loaded from storage. */
export type WorldMode = "create" | "load";

/** Boot vs in-game phase for the explorable world UI. */
export type WorldPhase = "booting" | "playing";

/** Props for the main game orchestrator component. */
export type WorldProps = {
  mode: WorldMode;
  /** Required when `mode` is `"load"`. */
  gameId?: string;
  /** Required when `mode` is `"create"` (passed from Home). */
  initialIdea?: string;
};

/** Active NPC dialogue panel state. */
export type WorldDialogueState = {
  npc: NonNullable<SceneData["npc"]> & object;
  history: DialogueTurn[];
  options: string[];
  thinking: boolean;
  mood?: string;
};

/** Signed configuration for an IDKit proof request. */
export type WidgetConfig = {
  app_id: `app_${string}`;
  action: string;
  /** "staging" = web simulator, "sandbox" = World ID Sandbox app, "production" = World App. */
  environment: "production" | "staging" | "sandbox";
  rp_context: import("@worldcoin/idkit").RpContext;
};

/** Evidence revealed only after the human's unlock is persisted. */
export type EvidenceResponse = { key: string; evidenceNote?: string; unlocks: number };

/** Decoder state shared by room notes and the case board. */
export type DecoderProps = { note: Note; evidenceKey?: string; onDecoded?: (code: string) => void };
/** Persisted evidence access state owned by the current run. */
export type EvidenceBoxProps = { gameId: string | null; evidence: EvidenceResponse | null; onUnlock: (value: EvidenceResponse) => void };
/** Complete dialogue controls, including presenting an inventory item. */
export type DialogueBoxProps = {
  npc: import("../universe").NpcDef; history: DialogueTurn[]; options: string[];
  thinking: boolean; speaking: boolean; voiceOn: boolean; mood?: string;
  inventory: string[]; onToggleVoice: () => void; onSay: (line: string, shownItem?: string) => void; onClose: () => void;
};
/** Pointer-driven movement and interact controls. */
export type MobileControlsProps = {
  touchInputRef: import("react").MutableRefObject<TouchInput>;
  nearHotspot: import("../universe").Hotspot | null; paused: boolean;
  onInteract: (hotspot: import("../universe").Hotspot) => void;
};
/** Player pose in normalized image coordinates. */
export type PlayerState = { x: number; y: number; dir: 1 | -1; moving: boolean };
/** Cardinal edge crossed by the player. */
export type ExitDirection = "n" | "e" | "s" | "w";
/** Movement axes shared with keyboard controls (-1, 0, 1). */
export type TouchInput = { x: number; y: number };
/** Programmatically generated UI/game effects. */
export type SfxName = "click" | "tap" | "toggleOn" | "toggleOff" | "open" | "close" | "pickup" | "success" | "error" | "hover" | "step" | "door" | "unlock" | "fail";
