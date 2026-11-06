import { describe, expect, it } from "vitest";
import type { DialogueResponse } from "@/lib/universe";
import { applyDialogueRules } from "@/lib/world-engine";

const reply = (over: Partial<DialogueResponse> = {}): DialogueResponse =>
  ({
    line: "Arre, why do you ask?",
    mood: "wary",
    options: ["Press harder", "Offer chai"],
    clueRevealed: false,
    offense: "none",
    done: false,
    ...over,
  }) as DialogueResponse;

const CLUE = "The courier was paid twice.";
const rules = (out: DialogueResponse, clueFound: boolean, exchanges: number) =>
  applyDialogueRules(out, { clue: CLUE, clueFound, exchanges });

describe("applyDialogueRules", () => {
  it("lets the model hold the clue on the first line", () => {
    const out = rules(reply(), false, 1);
    expect(out).toMatchObject({ clueRevealed: false, done: false });
    expect(out.options).toHaveLength(3);
  });

  it("forces the clue out by the second line when the model held it", () => {
    const out = rules(reply(), false, 2);
    expect(out.clueRevealed).toBe(true);
    expect(out.line).toContain(CLUE);
  });

  it("keeps the clue and closes the chat on a grave offense, even at the second line", () => {
    const out = rules(reply({ offense: "grave", clueRevealed: true }), false, 2);
    expect(out).toMatchObject({ clueRevealed: false, done: true, options: [] });
    expect(out.line).not.toContain(CLUE);
  });

  it("never reveals the clue twice, and closes once it is found", () => {
    const out = rules(reply({ clueRevealed: true }), true, 2);
    expect(out).toMatchObject({ clueRevealed: false, done: true, options: [] });
  });

  it("closes the chat by the third line", () => {
    expect(rules(reply({ clueRevealed: true }), false, 3)).toMatchObject({ done: true, options: [] });
  });

  it("treats an unknown offense as none", () => {
    expect(rules(reply({ offense: "rude" as never }), false, 1).offense).toBe("none");
  });
});
