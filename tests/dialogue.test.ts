import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  capReply,
  DialogueClosedError,
  dialogueTurn,
  MAX_REPLY_CHARS,
  mentionsClue,
  newNpcState,
  type Chat,
  type ChatMessage,
  type NpcState,
} from "@/lib/engine/dialogueTurn";
import type { Npc, TickerEvent } from "@/lib/types";
import { fixtureBible } from "@/fixtures/world";

const npc: Npc = {
  id: "npc-sakharam",
  name: "Sakharam",
  persona: "A tired dabbawala who counts every tiffin twice.",
  clue: "The code on your tiffin was changed by hand tonight.",
};
const SECRET = fixtureBible.mystery.secret;

const event: TickerEvent = {
  id: "e",
  kind: "dialogue",
  model: "test",
  startedAt: new Date(0).toISOString(),
  latencyMs: 1,
  requestId: "req-1",
  status: "ok",
};

/** A fake model that returns the given lines in order and records every prompt. */
function scripted(lines: Array<string | null>) {
  const prompts: ChatMessage[][] = [];
  const chat: Chat = async (messages) => {
    prompts.push(messages);
    return { text: lines[prompts.length - 1] ?? null, event };
  };
  return { chat, prompts };
}

async function talk(chat: Chat, n: number) {
  let state: NpcState = newNpcState();
  const results = [];
  for (let i = 0; i < n; i++) {
    const r = await dialogueTurn(npc, state, `question ${i + 1}`, chat);
    state = r.state;
    results.push(r);
  }
  return results;
}

describe("dialogue clue and turn rules", () => {
  it("reveals the clue by the second NPC reply even if the model never says it", async () => {
    const { chat } = scripted(["Busy night.", "Rain, rain, rain.", "Go home."]);
    const [first, second] = await talk(chat, 2);
    expect(first!.clueRevealed).toBe(false);
    expect(second!.clueRevealed).toBe(true);
    expect(second!.reply).toContain(npc.clue);
  });

  it("asks the model for the clue on the second reply", async () => {
    const { chat, prompts } = scripted(["Busy night.", "Fine."]);
    await talk(chat, 2);
    expect(prompts[0]![0]!.content).not.toMatch(/tell the player that fact/);
    expect(prompts[1]![0]!.content).toMatch(/tell the player that fact/);
  });

  it("accepts a clue the model gives early, in its own words", async () => {
    const { chat } = scripted([
      "Someone changed the code on your tiffin by hand tonight, I saw the chalk.",
    ]);
    const [first] = await talk(chat, 1);
    expect(first!.clueRevealed).toBe(true);
  });

  it("uses the clue line when there is no model text (fixtures)", async () => {
    const { chat } = scripted([null, null, null]);
    const r = await talk(chat, 3);
    expect(r[1]!.reply).toContain(npc.clue);
    expect(r.map((t) => t.reply.length > 0)).toEqual([true, true, true]);
  });

  it("sets close after the third NPC reply and refuses a fourth", async () => {
    const { chat, prompts } = scripted(["a", "b", "c", "d"]);
    const r = await talk(chat, 3);
    expect(r.map((t) => t.close)).toEqual([false, false, true]);
    await expect(dialogueTurn(npc, r[2]!.state, "again?", chat)).rejects.toBeInstanceOf(
      DialogueClosedError,
    );
    expect(prompts).toHaveLength(3); // no model call after close
  });

  it("never includes the mystery secret in the NPC prompt", async () => {
    const { chat, prompts } = scripted(["a", "b", "c"]);
    await talk(chat, 3);
    for (const p of prompts) {
      const all = p.map((m) => m.content).join("\n");
      expect(all).not.toContain(SECRET);
      expect(all).toContain(npc.clue);
    }
  });

  it("builds the prompt from server-held history, not client input", () => {
    const state: NpcState = {
      replies: 1,
      clueRevealed: false,
      history: [
        { role: "player", text: "hi" },
        { role: "npc", text: "hello" },
      ],
    };
    const p = buildPrompt(npc, state, "next");
    expect(p.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
  });

  it("caps reply length", async () => {
    const long = "This is a sentence about rain. ".repeat(40);
    const { chat } = scripted([long]);
    const [first] = await talk(chat, 1);
    expect(first!.reply.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    expect(capReply("short")).toBe("short");
  });

  it("keeps the forced clue whole even after a long model reply", async () => {
    const long = "word ".repeat(200);
    const { chat } = scripted(["hm", long]);
    const [, second] = await talk(chat, 2);
    expect(second!.reply.endsWith(`"${npc.clue}"`)).toBe(true);
  });

  it("matches clues by key words, not exact text", () => {
    expect(mentionsClue("Nothing to see here.", npc.clue)).toBe(false);
    expect(mentionsClue("tonight someone changed your tiffin code by hand", npc.clue)).toBe(true);
  });
});
