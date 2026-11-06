import { processStore } from "@/lib/env";
import type { NpcState } from "./dialogueTurn";

// shortcut: in-memory, one server process only, lost on restart (see README "Known limits").
const states = processStore("dialogueStates", () => new Map<string, NpcState>());
const MAX_ENTRIES = 50_000;

const key = (playerId: string, worldId: string, npcId: string) => `${playerId}:${worldId}:${npcId}`;

export function loadNpcState(playerId: string, worldId: string, npcId: string): NpcState {
  return states.get(key(playerId, worldId, npcId)) ?? { replies: 0, clueRevealed: false, history: [] };
}

export function saveNpcState(
  playerId: string,
  worldId: string,
  npcId: string,
  state: NpcState,
): void {
  const k = key(playerId, worldId, npcId);
  states.delete(k); // re-insert so Map order stays oldest-first
  states.set(k, state);
  if (states.size > MAX_ENTRIES) states.delete(states.keys().next().value!);
}
