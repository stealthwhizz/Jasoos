import { describe, expect, it } from "vitest";
import {
  ALPHABET,
  CodecError,
  decodeNote,
  encodeNote,
  ensureNothingHidden,
  findSlots,
  slotsNeeded,
  writeBits,
} from "@/lib/engine/codec";
import { CODEBOOK } from "@/lib/engine/codebook";
import {
  generateNotes,
  hiddenNoteLocation,
  noteSecret,
  templateNote,
  type NoteChat,
} from "@/lib/engine/notes";
import { FIXTURE_NOTE_SECRET, fixtureBible, fixtureNotes } from "@/fixtures/world";
import type { TickerEvent } from "@/lib/types";

const COVER = templateNote("test", 40);

/** Seeded random secrets so failures are reproducible. */
function* secrets(n: number) {
  let s = 7;
  const next = () => (s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32;
  for (let i = 0; i < n; i++) {
    const len = 1 + Math.floor(next() * 4);
    yield Array.from({ length: len }, () => ALPHABET[Math.floor(next() * 32)]).join("");
  }
}

describe("hidden-note codec", () => {
  it("round-trips a secret through encodeNote and decodeNote", () => {
    const note = encodeNote("KEY", COVER);
    const result = decodeNote(note);
    expect(result).toMatchObject({ hidden: true, secret: "KEY" });
    expect(result.marks).toHaveLength(slotsNeeded("KEY"));
  });

  it("round-trips every secret in a large random sample (failure rate 0)", () => {
    let failures = 0;
    let total = 0;
    for (const secret of secrets(2000)) {
      total++;
      if (decodeNote(encodeNote(secret, COVER)).secret !== secret) failures++;
    }
    expect(failures / total).toBe(0);
  });

  it("changes only codebook words and keeps capitalisation", () => {
    const note = encodeNote("KEY", COVER);
    const strip = (t: string) =>
      findSlots(t).reduceRight((acc, s) => acc.slice(0, s.start) + "_" + acc.slice(s.end), t);
    expect(strip(note)).toBe(strip(COVER));
    const caps = writeBits("Maybe. MAYBE. maybe.", [1, 1, 1]);
    expect(caps).toBe("Perhaps. PERHAPS. perhaps.");
  });

  it("reports nothing hidden on ordinary text", () => {
    expect(decodeNote("Bun maska, chai, kheema pav. Cash only after ten.")).toEqual({
      hidden: false,
      marks: [],
    });
    expect(decodeNote("")).toEqual({ hidden: false, marks: [] });
  });

  it("rarely passes the check by chance, and ensureNothingHidden removes those cases", () => {
    // Ordinary covers with random word choices: about 1 in 64 should pass the check by chance.
    const slots = findSlots(COVER).length;
    let chance = 0;
    let s = 99;
    for (let i = 0; i < 2000; i++) {
      const bits = Array.from({ length: slots }, () => {
        s = (s * 1103515245 + 12345) >>> 0;
        return (s >>> 16) & 1 ? 1 : 0;
      }) as Array<0 | 1>;
      const text = writeBits(COVER, bits);
      if (decodeNote(text).hidden) {
        chance++;
        expect(decodeNote(ensureNothingHidden(text)).hidden).toBe(false);
      }
    }
    expect(chance / 2000).toBeLessThan(0.04);
  });

  it("fails cleanly when the cover text has too few codebook slots", () => {
    expect(() => encodeNote("KEY", "Just a short line about tea.")).toThrow(CodecError);
    expect(() => encodeNote("TOOLONG", COVER)).toThrow(CodecError);
    expect(() => encodeNote("K!", COVER)).toThrow(CodecError);
  });

  it("has a codebook with no repeated words", () => {
    const words = CODEBOOK.flat();
    expect(new Set(words).size).toBe(words.length);
  });
});

describe("notes", () => {
  it("the fixture ledger decodes to its secret, and the menu to nothing", () => {
    const [ledger, menu] = fixtureNotes;
    expect(decodeNote(ledger!.text).secret).toBe(FIXTURE_NOTE_SECRET);
    expect(decodeNote(menu!.text).hidden).toBe(false);
  });

  const event: TickerEvent = {
    id: "e",
    kind: "plan",
    model: "test",
    startedAt: new Date(0).toISOString(),
    latencyMs: 1,
    requestId: "req",
    status: "ok",
  };

  it("hides the culprit code in exactly one note, outside the culprit's building", async () => {
    const chat: NoteChat = async () => ({ text: null, event });
    const { notes } = await generateNotes(fixtureBible, chat);
    expect(notes).toHaveLength(3);
    const hidden = notes.filter((n) => n.hasHidden);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.locationId).toBe(hiddenNoteLocation(fixtureBible).id);
    expect(decodeNote(hidden[0]!.text).secret).toBe(noteSecret(fixtureBible));
    expect(noteSecret(fixtureBible)).toBe("MEER");
    for (const n of notes.filter((n) => !n.hasHidden))
      expect(decodeNote(n.text).hidden).toBe(false);
  });

  it("uses the model's note when it has enough slots, and retries once when it does not", async () => {
    const good = templateNote("model", 40);
    const replies = ["Too short.", good];
    let calls = 0;
    const chat: NoteChat = async () => ({ text: replies[Math.min(calls++, 1)]!, event });
    const { notes, events } = await generateNotes(fixtureBible, chat);
    const hidden = notes.find((n) => n.hasHidden)!;
    expect(decodeNote(hidden.text).secret).toBe(noteSecret(fixtureBible));
    expect(events.length).toBeGreaterThanOrEqual(3);
  });
});

describe("articles", () => {
  it("keeps a/an correct after a swap", () => {
    expect(writeBits("It was a strange night. An honest man.", [1, 1])).toBe(
      "It was an odd night. A truthful man.",
    );
  });
});
