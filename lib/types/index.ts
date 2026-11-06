// Shared contracts between engine (A), client (B), and chain (C). Change only with all three agreeing.

export interface Npc {
  id: string;
  name: string;
  persona: string;
  clue: string;
}

export interface Location {
  id: string;
  name: string;
  interiorDescription: string;
  npc: Npc;
}

export interface WorldBible {
  title: string;
  premise: string;
  artStyle: string;
  streetDescription: string;
  protagonist: string;
  locations: [Location, Location, Location];
  mystery: {
    secret: string;
    finalePrompt: string;
    /** Server-only. Stripped before any manifest reaches the browser. */
    culpritNpcId: string;
  };
}

export type AssetKind = "street" | "sprite" | "interior" | "finale";
export type AssetStatus = "pending" | "ready" | "failed";

export interface Asset {
  id: string;
  kind: AssetKind;
  url: string;
  storageRoot?: string;
  model: string;
  requestId: string;
  status: AssetStatus;
}

/** Coarse walkability grid; cells[row * cols + col] is true when walkable. */
export interface WalkMap {
  cols: number;
  rows: number;
  cells: boolean[];
}

/** Door rectangle in normalized 0..1 image coordinates. */
export interface Door {
  id: string;
  locationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Note {
  id: string;
  locationId: string;
  text: string;
  hasHidden: boolean;
}

export interface Manifest {
  worldId: string;
  bible: WorldBible;
  assets: Asset[];
  walkMap: WalkMap;
  doors: Door[];
  notes: Note[];
  createdAt: string;
}

/** What GET /api/worlds/[id] returns: the manifest without the mystery. */
export type PublicManifest = Omit<Manifest, "bible"> & { bible: Omit<WorldBible, "mystery"> };

export type TickerKind = "moderation" | "plan" | "image" | "vision" | "dialogue";

export interface TickerEvent {
  id: string;
  kind: TickerKind;
  model: string;
  startedAt: string;
  latencyMs: number;
  requestId: string;
  status: "ok" | "failed";
}

export interface DialogueMessage {
  role: "player" | "npc";
  text: string;
}

export interface DialogueRequest {
  worldId: string;
  npcId: string;
  history: DialogueMessage[];
  message: string;
}

export interface DialogueResponse {
  reply: string;
  clueRevealed: boolean;
  close: boolean;
}

export interface Accusation {
  worldKey: string;
  humanHash: string;
  culpritId: string;
}
