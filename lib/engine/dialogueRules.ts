import type { DialogueResponse, Npc } from "@/lib/types";

export const MAX_REPLY = 280;

/** The NPC's system prompt. Built from persona and clue only; the mystery secret never enters. */
export function npcSystemPrompt(npc: Npc, npcTurns: number): string {
  const lines = [
    `You are ${npc.name}, a character in a detective game. ${npc.persona}`,
    `You know one thing that matters: ${npc.clue}`,
    "Stay in character. Reply in at most two short sentences. Never mention being an AI.",
  ];
  if (npcTurns >= 1) lines.push("In this reply, tell the detective what you know, plainly.");
  if (npcTurns >= 2) lines.push("This is your last reply. End the conversation.");
  return lines.join("\n");
}

/** Does the reply carry the clue? At least half of the clue's longer words must appear. */
export function mentionsClue(reply: string, clue: string): boolean {
  const words = clue.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const text = reply.toLowerCase();
  return words.length > 0 && words.filter((w) => text.includes(w)).length / words.length >= 0.5;
}

/** Cuts at the last sentence end that fits, else hard-cuts with an ellipsis. */
export function capReply(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_REPLY) return t;
  const cut = t.slice(0, MAX_REPLY);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 0 ? cut.slice(0, end + 1) : `${cut.slice(0, MAX_REPLY - 1)}…`;
}

/**
 * R7 in code, not only in the prompt: the clue is revealed by the second reply (appended if the
 * model skipped it) and the chat closes after the third.
 */
export function applyDialogueRules(raw: string, npc: Npc, npcTurns: number): DialogueResponse {
  let reply = capReply(raw) || `${npc.name} says nothing.`;
  const mentioned = mentionsClue(reply, npc.clue);
  if (npcTurns >= 1 && !mentioned) reply = `${reply} ${npc.clue}`;
  return { reply, clueRevealed: npcTurns >= 1 || mentioned, close: npcTurns >= 2 };
}
