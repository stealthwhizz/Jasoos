import { describe, expect, it } from "vitest";
import {
  MAX_REPLY,
  applyDialogueRules,
  capReply,
  mentionsClue,
  npcSystemPrompt,
} from "@/lib/engine/dialogueRules";
import { fixtureBible } from "@/fixtures/world";

const npc = fixtureBible.locations[1].npc;

describe("dialogue clue and turn rules", () => {
  it("does not force the clue on the first reply", () => {
    const r = applyDialogueRules("Who is asking?", npc, 0);
    expect(r).toEqual({ reply: "Who is asking?", clueRevealed: false, close: false });
  });

  it("counts an early clue the model gave on its own", () => {
    expect(applyDialogueRules(npc.clue, npc, 0).clueRevealed).toBe(true);
  });

  it("reveals the clue by the second NPC reply even if the model skipped it", () => {
    const r = applyDialogueRules("Hmm, the rain is heavy.", npc, 1);
    expect(r.clueRevealed).toBe(true);
    expect(r.reply).toContain(npc.clue);
    expect(r.close).toBe(false);
  });

  it("does not repeat a clue the model already gave", () => {
    const said = "Someone changed the code on your tiffin by hand tonight.";
    expect(mentionsClue(said, npc.clue)).toBe(true);
    expect(applyDialogueRules(said, npc, 1).reply).toBe(said);
  });

  it("sets close after the third NPC reply", () => {
    expect(applyDialogueRules("Goodbye.", npc, 2).close).toBe(true);
  });

  it("never includes the mystery secret in the NPC prompt", () => {
    for (const { npc: n } of fixtureBible.locations) {
      for (const turn of [0, 1, 2]) {
        expect(npcSystemPrompt(n, turn)).not.toContain(fixtureBible.mystery.secret);
      }
    }
  });

  it("caps reply length at a sentence end when it can", () => {
    const long = "Short one. " + "word ".repeat(80);
    expect(capReply(long)).toBe("Short one.");
    expect(capReply("x".repeat(500))).toHaveLength(MAX_REPLY);
  });
});
