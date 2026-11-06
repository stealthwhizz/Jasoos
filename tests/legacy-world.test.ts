import { describe, expect, it } from "vitest";
import { readMystery, seal } from "@/lib/world-engine";
import type { GameBible } from "@/lib/universe";

// Only `story` matters to readMystery; the rest of the bible is irrelevant here.
const bibleWith = (story: Record<string, unknown>) => ({ story }) as unknown as GameBible;

describe("readMystery", () => {
  it("unseals the mystery of a current world", () => {
    const mystery = { secret: "The tiffin hides a key.", culprit: 2, key: "KEY" };
    const bible = bibleWith({ goal: "g", clues: ["a", "b", "c"], sealed: seal(mystery) });
    expect(readMystery(bible)).toEqual(mystery);
  });

  it("reads an older world's plain secret instead of crashing, with no culprit", () => {
    const bible = bibleWith({ goal: "g", secret: "Old plain secret.", clues: ["a", "b", "c"] });
    expect(readMystery(bible)).toEqual({ secret: "Old plain secret.", culprit: -1 });
  });

  it("copes with a story that has neither", () => {
    expect(readMystery(bibleWith({ goal: "g", clues: [] }))).toEqual({ secret: "", culprit: -1 });
  });
});
