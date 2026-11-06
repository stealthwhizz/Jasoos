import type { Asset, Manifest, Note, WalkMap, WorldBible } from "@/lib/types";

// TODO(A): replace with a real saved run once 0G works; keep this one as the labelled backup world.

export const fixtureBible: WorldBible = {
  title: "The Monsoon Tiffin",
  premise:
    "Rain floods the night market in Dadar. You are a detective carrying a tiffin box someone will kill for. Find out who wants it before the trains stop.",
  artStyle: "flat illustrated, warm sodium lights, rain, muted blues",
  streetDescription:
    "A flooded night-market street with three shopfronts and lit doors: an Irani cafe, a dabbawala depot, and a pawn shop.",
  protagonist: "A detective in a brown trench coat and flat cap, holding a steel tiffin box",
  locations: [
    {
      id: "cafe",
      name: "Irani Cafe",
      interiorDescription: "Bentwood chairs, a glass bun counter, a ceiling fan turning slowly.",
      npc: {
        id: "npc-rustom",
        name: "Rustom",
        persona: "The cafe owner. Gruff, kind, notices everything.",
        clue: "A man in a wet blue raincoat asked which tiffin had the red thread.",
      },
    },
    {
      id: "depot",
      name: "Dabba Depot",
      interiorDescription: "Racks of tiffin boxes, chalk codes on wooden crates.",
      npc: {
        id: "npc-sakharam",
        name: "Sakharam",
        persona: "A dabbawala of thirty years. Proud of never losing a box.",
        clue: "The code on your tiffin was changed by hand tonight.",
      },
    },
    {
      id: "pawn",
      name: "Pawn Shop",
      interiorDescription: "Brass lamps, a locked glass case, an old ledger on the counter.",
      npc: {
        id: "npc-meera",
        name: "Meera",
        persona: "The pawnbroker. Polite, careful, wears a blue raincoat.",
        clue: "She pawned a key with a red thread tied to it this afternoon.",
      },
    },
  ],
  mystery: {
    secret: "The tiffin hides the key to the pawn shop's case, and Meera wants it back.",
    finalePrompt: "A pawnbroker in a blue raincoat caught opening a glass case in the rain",
    culpritNpcId: "npc-meera",
  },
};

const asset = (id: string, kind: Asset["kind"], file: string, n: number): Asset => ({
  id,
  kind,
  url: `/fixtures/${file}.svg`,
  model: "fixture",
  requestId: `fx-req-${String(n).padStart(4, "0")}`,
  status: "ready",
});

const COLS = 96;
const ROWS = 54;
// Same shape as the PRD fallback map: the lower third of the street is walkable.
export const fixtureWalkMap: WalkMap = {
  cols: COLS,
  rows: ROWS,
  cells: Array.from({ length: COLS * ROWS }, (_, i) => Math.floor(i / COLS) >= ROWS * (2 / 3)),
};

export const fixtureNotes: Note[] = [
  {
    id: "note-ledger",
    locationId: "pawn",
    text: "Shut early today. The large brass lamp sold fast, perhaps to the man from the depot. Frequently he waits below the stairs.",
    hasHidden: true,
  },
  {
    id: "note-menu",
    locationId: "cafe",
    text: "Bun maska, chai, kheema pav. Cash only after ten.",
    hasHidden: false,
  },
];

/** Decoded answers for fixture notes, used by the decodeNote stub until the real codec lands. */
export const fixtureNoteSecrets: Record<string, string> = { "note-ledger": "KEY" };

export const fixtureManifest: Manifest = {
  worldId: "fixture-monsoon-tiffin",
  bible: fixtureBible,
  assets: [
    asset("street", "street", "street", 3),
    asset("sprite", "sprite", "sprite", 4),
    asset("interior-cafe", "interior", "interior-cafe", 5),
    asset("interior-depot", "interior", "interior-depot", 6),
    asset("interior-pawn", "interior", "interior-pawn", 7),
    asset("finale", "finale", "finale", 9),
  ],
  walkMap: fixtureWalkMap,
  doors: [
    { id: "door-cafe", locationId: "cafe", x: 0.15625, y: 0.5, w: 0.0625, h: 0.1667 },
    { id: "door-depot", locationId: "depot", x: 0.46875, y: 0.5, w: 0.0625, h: 0.1667 },
    { id: "door-pawn", locationId: "pawn", x: 0.78125, y: 0.5, w: 0.0625, h: 0.1667 },
  ],
  notes: fixtureNotes,
  createdAt: "2026-11-06T10:00:00.000Z",
};
