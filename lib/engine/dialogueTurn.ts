import type { DialogueMessage, DialogueResponse, Npc, TickerEvent } from "@/lib/types";
import { zgCall } from "@/lib/zg";
import { moderate } from "./moderate";

/**
 * R7 dialogue rules, enforced here in code and not only in the prompt (PRD "Dialogue rules"):
 * - the server builds the prompt from the persona and the clue; the mystery secret never goes in
 * - the clue appears by the second NPC reply: the prompt asks for it, and if the model still
 *   skipped it, the server adds it to the reply
 * - after the third NPC reply the chat closes, and no more model calls are made
 * - replies have a length cap and pass moderation before they reach the player
 */

export const MAX_NPC_REPLIES = 3;
/** Zero-based index of the reply that must carry the clue (the second reply). */
export const CLUE_BY_REPLY = 1;
export const MAX_REPLY_CHARS = 280;
const MAX_TOKENS = 120;

/** Per player, per NPC. Kept on the server so a client cannot reset it. */
export interface NpcState {
  replies: number;
  clueRevealed: boolean;
  history: DialogueMessage[];
}

export const newNpcState = (): NpcState => ({ replies: 0, clueRevealed: false, history: [] });

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function buildPrompt(npc: Npc, state: NpcState, message: string): ChatMessage[] {
  const replyIndex = state.replies;
  const rules = [
    `You are ${npc.name}, a character in a detective game. Stay in character.`,
    `Persona: ${npc.persona}`,
    `You know one fact the player needs: "${npc.clue}"`,
    `Answer in at most two short sentences. Do not narrate the player's actions.`,
    `You know nothing else about the case. Do not invent other clues, names, or culprits.`,
  ];
  if (replyIndex >= CLUE_BY_REPLY && !state.clueRevealed) {
    rules.push(`In this reply, tell the player that fact plainly, in your own voice.`);
  }
  if (replyIndex === MAX_NPC_REPLIES - 1) {
    rules.push(`This is your last reply. End the conversation.`);
  }
  return [
    { role: "system", content: rules.join("\n") },
    ...state.history.map<ChatMessage>((m) => ({
      role: m.role === "npc" ? "assistant" : "user",
      content: m.text,
    })),
    { role: "user", content: message },
  ];
}

const STOP = new Set(
  "the a an and or but of to in on at by for with from this that these those was were is are be been has have had who which what your you his her their its it tonight today".split(
    " ",
  ),
);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** True when most of the clue's key words appear in the reply. */
export function mentionsClue(reply: string, clue: string): boolean {
  const want = new Set(keywords(clue));
  if (want.size === 0) return true;
  const have = new Set(keywords(reply));
  let hits = 0;
  for (const w of want) if (have.has(w)) hits++;
  return hits / want.size >= 0.6;
}

/** Trims to the cap, at a sentence end when one is close enough, otherwise at a word. */
export function capReply(text: string, max = MAX_REPLY_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (sentenceEnd > max * 0.5) return cut.slice(0, sentenceEnd + 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

/** Reads reply text from a 0G chat result: a plain string or an OpenAI-style completion. */
function replyText(data: unknown): string | null {
  if (typeof data === "string") return data;
  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> } | null)
    ?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

/** Lines used when there is no model text (fixtures) or the model line fails moderation. */
function fallbackLine(npc: Npc, replyIndex: number): string {
  if (replyIndex === 0) return `${npc.name} looks you over. "Ask what you came to ask."`;
  if (replyIndex >= MAX_NPC_REPLIES - 1) return `"That is all I know. Leave me be."`;
  return `"I have nothing more for you."`;
}

export type Chat = (
  messages: ChatMessage[],
) => Promise<{ text: string | null; event: TickerEvent }>;

const zgChat: Chat = async (messages) => {
  const { event, data } = await zgCall("dialogue", { messages, maxTokens: MAX_TOKENS });
  return { text: replyText(data), event };
};

export interface TurnResult extends DialogueResponse {
  event: TickerEvent;
  state: NpcState;
}

export class DialogueClosedError extends Error {}

/** One NPC reply. Returns the reply, the clue and close flags, and the next state. */
export async function dialogueTurn(
  npc: Npc,
  state: NpcState,
  message: string,
  chat: Chat = zgChat,
): Promise<TurnResult> {
  if (state.replies >= MAX_NPC_REPLIES)
    throw new DialogueClosedError(`${npc.name} is done talking.`);
  const replyIndex = state.replies;

  const { text, event } = await chat(buildPrompt(npc, state, message));
  let reply = capReply(text ?? "");
  if (reply && !(await moderate(reply)).allowed) reply = "";
  const fromModel = Boolean(reply);
  if (!fromModel) reply = fallbackLine(npc, replyIndex);

  let clueRevealed = state.clueRevealed || mentionsClue(reply, npc.clue);
  // The rule in code: by the second reply the clue is out, whatever the model did.
  if (!clueRevealed && replyIndex >= CLUE_BY_REPLY) {
    const forced = `"${npc.clue.replace(/^"|"$/g, "")}"`;
    reply = fromModel
      ? capReply(`${reply} ${forced}`, MAX_REPLY_CHARS + forced.length + 1)
      : `${npc.name} leans in. ${forced}`;
    clueRevealed = true;
  }

  const replies = replyIndex + 1;
  const next: NpcState = {
    replies,
    clueRevealed,
    history: [...state.history, { role: "player", text: message }, { role: "npc", text: reply }],
  };
  return { reply, clueRevealed, close: replies >= MAX_NPC_REPLIES, event, state: next };
}
