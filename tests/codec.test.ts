import { describe, expect, it } from "vitest";
import { ALPHABET, SLOTS, decodeNote, encodeNote, scrubNote } from "@/lib/engine/codec";
import { CODEBOOK } from "@/lib/engine/codebook";
import { fixtureNotes } from "@/fixtures/world";

// A cover note with exactly enough codebook words, built from varied pairs.
const cover = (offset: number) =>
  Array.from(
    { length: SLOTS },
    (_, i) => `the ${CODEBOOK[(i + offset) % CODEBOOK.length]![0]} one`,
  ).join(", ") + ".";

describe("hidden-note codec", () => {
  it("round-trips every secret through encodeNote and decodeNote", () => {
    let failures = 0;
    let n = 0;
    for (const a of ALPHABET)
      for (const b of ALPHABET)
        for (const c of "AKY") {
          const secret = a + b + c;
          const result = decodeNote(encodeNote(secret, cover(n++))!);
          if (!result.hidden || result.secret !== secret || result.marks.length !== SLOTS)
            failures++;
        }
    expect(failures).toBe(0);
  });

  it("keeps the cover text apart from the swapped words, and their capitals", () => {
    const out = encodeNote("KEY", "Shut it. " + cover(0))!;
    expect(out.startsWith("Shut it. ") || out.startsWith("Closed it. ")).toBe(true);
    expect(out.replace(/\b[a-z]+\b/gi, "w")).toBe(
      ("Shut it. " + cover(0)).replace(/\b[a-z]+\b/gi, "w"),
    );
  });

  it("reports nothing hidden on ordinary text", () => {
    expect(decodeNote("Bun maska, chai, kheema pav. Cash only after ten.")).toEqual({
      hidden: false,
      marks: [],
    });
    expect(decodeNote(scrubNote(encodeNote("KEY", cover(3))!)).hidden).toBe(false);
  });

  it("returns null when the cover has too few codebook slots", () => {
    expect(encodeNote("KEY", "A short note with one big word.")).toBeNull();
  });

  it("rejects secrets outside the alphabet", () => {
    expect(() => encodeNote("KEX", cover(0))).toThrow();
  });

  it("decodes the fixture ledger note", () => {
    const ledger = fixtureNotes.find((n) => n.hasHidden)!;
    expect(decodeNote(ledger.text).secret).toBe("KEY");
  });

  it("has no word in two pairs", () => {
    const words = CODEBOOK.flat();
    expect(new Set(words).size).toBe(words.length);
  });
});
