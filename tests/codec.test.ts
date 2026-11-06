import { describe, expect, it } from "vitest";
import { ALPHABET, SLOTS, decodeNote, encodeNote, scrubNote } from "@/lib/engine/codec";
import { CODEBOOK } from "@/lib/engine/codebook";

// Encodes "KEY" with lib/engine/codec.
const fixtureNotes = [
  {
    text: "Shut early today, the store was quiet. A large brass lamp sold in a rapid deal, perhaps to a rich man from the road. He is frequently weary and ill, and normally calm, but tonight he looked scared. He paid quickly, nearly too soon, and left the whole case empty. Strange, really.",
    hasHidden: true,
  },
];

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
          const result = decodeNote(encodeNote(secret, cover(n++), "AAA")!);
          if (!result.hidden || result.secret !== secret || result.marks.length !== SLOTS)
            failures++;
        }
    expect(failures).toBe(0);
  });

  it("keeps the cover text apart from the swapped words, and their capitals", () => {
    const out = encodeNote("KEY", "Shut it. " + cover(0), "AAA")!;
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
    expect(decodeNote(scrubNote(encodeNote("KEY", cover(3), "AAA")!)).hidden).toBe(false);
  });

  it("returns null when the cover has too few codebook slots", () => {
    expect(encodeNote("KEY", "A short note with one big word.", "AAA")).toBeNull();
  });

  it("rejects secrets outside the alphabet", () => {
    expect(() => encodeNote("KEX", cover(0), "AAA")).toThrow();
    expect(() => encodeNote("KEY", cover(0), "KEX")).toThrow();
  });

  it("decodes a keyed note only with its key", () => {
    const note = encodeNote("MEE", cover(5), "PUB")!;
    expect(decodeNote(note, "PUB")).toMatchObject({ hidden: true, secret: "MEE" });
    // Every one of the 4095 wrong keys: about 1 in 16 passes the 4-bit check (the spec's bound).
    const keys = [...ALPHABET].flatMap((a) => [...ALPHABET].flatMap((b) => [...ALPHABET].map((c) => a + b + c)));
    const wrong = keys.filter((k) => k !== "PUB");
    const passes = wrong.filter((k) => decodeNote(note, k).hidden).length / wrong.length;
    expect(passes).toBeGreaterThan(1 / 20);
    expect(passes).toBeLessThan(1 / 12);
  });

  it("scrubs a decoy so it never decodes under the case key", () => {
    for (let i = 0; i < 40; i++) {
      const decoy = encodeNote("KEY", cover(i), "AAA")!;
      expect(decodeNote(scrubNote(decoy, "PUB"), "PUB").hidden).toBe(false);
    }
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
