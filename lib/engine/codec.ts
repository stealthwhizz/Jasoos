import { CODEBOOK } from "./codebook";

/**
 * Hidden-note codec (R21, R22). A game mechanic, not security: the codebook ships to the browser.
 *
 * Every codebook word in a note is a slot carrying one bit (first word of its pair = 0, second
 * = 1). Bits, in reading order:
 *   [length - 1: 2 bits] [each letter: 5 bits] [check value: 6 bits]
 * A 3-letter secret needs 2 + 15 + 6 = 23 slots. Slots after the message are ignored. Ordinary
 * text passes the check by chance about 1 time in 64.
 */

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const MAX_SECRET_LENGTH = 4;
const LEN_BITS = 2;
const CHAR_BITS = 5;
const CHECK_BITS = 6;

export interface DecodeResult {
  hidden: boolean;
  secret?: string;
  /** Character ranges of the slots that carry the message, for the Decoder to highlight. */
  marks: Array<{ start: number; end: number }>;
}

export class CodecError extends Error {}

const LOOKUP = new Map<string, { pair: number; bit: 0 | 1 }>();
CODEBOOK.forEach(([a, b], pair) => {
  for (const [word, bit] of [
    [a, 0],
    [b, 1],
  ] as const) {
    if (LOOKUP.has(word)) throw new Error(`codebook: "${word}" appears twice`);
    LOOKUP.set(word, { pair, bit });
  }
});
const WORD_RE = new RegExp(`\\b(${[...LOOKUP.keys()].join("|")})\\b`, "gi");

interface Slot {
  start: number;
  end: number;
  word: string;
  pair: number;
  bit: 0 | 1;
}

/** Every codebook word in the text, in reading order. */
export function findSlots(text: string): Slot[] {
  return [...text.matchAll(WORD_RE)].map((m) => {
    const { pair, bit } = LOOKUP.get(m[0].toLowerCase())!;
    return { start: m.index, end: m.index + m[0].length, word: m[0], pair, bit };
  });
}

export function slotsNeeded(secret: string): number {
  return LEN_BITS + secret.length * CHAR_BITS + CHECK_BITS;
}

/** Upper-cases and checks that the secret fits the alphabet and the length limit. */
export function normalizeSecret(secret: string): string {
  const s = secret.toUpperCase();
  if (s.length < 1 || s.length > MAX_SECRET_LENGTH) {
    throw new CodecError(`Secret must be 1 to ${MAX_SECRET_LENGTH} characters.`);
  }
  for (const c of s) if (!ALPHABET.includes(c)) throw new CodecError(`"${c}" is not encodable.`);
  return s;
}

/** FNV-1a over the length and letter values, cut to CHECK_BITS. */
function checkValue(values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of [values.length, ...values]) {
    h ^= v + 0x5a;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & ((1 << CHECK_BITS) - 1);
}

const toBits = (value: number, width: number) =>
  Array.from({ length: width }, (_, i) => ((value >> (width - 1 - i)) & 1) as 0 | 1);
const fromBits = (bits: Array<0 | 1>) => bits.reduce<number>((n, b) => (n << 1) | b, 0);

function secretBits(secret: string): Array<0 | 1> {
  const values = [...secret].map((c) => ALPHABET.indexOf(c));
  return [
    ...toBits(values.length - 1, LEN_BITS),
    ...values.flatMap((v) => toBits(v, CHAR_BITS)),
    ...toBits(checkValue(values), CHECK_BITS),
  ];
}

/** Keeps the original word's capitalisation: "Perhaps" stays capitalised, "LARGE" stays upper. */
function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0]!.toUpperCase()) {
    return replacement[0]!.toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** "a odd" → "an odd", "an strange" → "a strange". Articles are not slots, so decoding is unchanged. */
function fixArticle(before: string, next: string): string {
  return before.replace(/\b(a|an)(\s+)$/i, (_, article: string, space: string) => {
    const wanted = /^[aeiou]/i.test(next) ? "an" : "a";
    const cased = article[0] === "A" ? wanted[0]!.toUpperCase() + wanted.slice(1) : wanted;
    return cased + space;
  });
}

/** Rewrites the first slots so they carry `bits`; other words stay as they were. */
export function writeBits(text: string, bits: Array<0 | 1>): string {
  const slots = findSlots(text);
  if (slots.length < bits.length) {
    throw new CodecError(`Cover text has ${slots.length} slots; ${bits.length} are needed.`);
  }
  let out = "";
  let at = 0;
  bits.forEach((bit, i) => {
    const slot = slots[i]!;
    const word = matchCase(slot.word, CODEBOOK[slot.pair]![bit]);
    out = fixArticle(out + text.slice(at, slot.start), word) + word;
    at = slot.end;
  });
  return out + text.slice(at);
}

/** R21: picks a codebook variant per slot so the note carries the secret and its check value. */
export function encodeNote(secret: string, coverText: string): string {
  return writeBits(coverText, secretBits(normalizeSecret(secret)));
}

/** R22: reads the slots in order, rebuilds the secret, and accepts it only if the check passes. */
export function decodeNote(text: string): DecodeResult {
  const nothing: DecodeResult = { hidden: false, marks: [] };
  const slots = findSlots(text);
  if (slots.length < LEN_BITS) return nothing;
  const bits = slots.map((s) => s.bit);
  const length = fromBits(bits.slice(0, LEN_BITS)) + 1;
  const needed = LEN_BITS + length * CHAR_BITS + CHECK_BITS;
  if (slots.length < needed) return nothing;

  const values = Array.from({ length }, (_, i) =>
    fromBits(bits.slice(LEN_BITS + i * CHAR_BITS, LEN_BITS + (i + 1) * CHAR_BITS)),
  );
  const check = fromBits(bits.slice(needed - CHECK_BITS, needed));
  if (check !== checkValue(values)) return nothing;

  return {
    hidden: true,
    secret: values.map((v) => ALPHABET[v]).join(""),
    marks: slots.slice(0, needed).map(({ start, end }) => ({ start, end })),
  };
}

/**
 * Makes sure ordinary text does not decode by chance: flips one slot at a time until the check
 * fails. Returns the text unchanged when it already reads as nothing hidden.
 */
export function ensureNothingHidden(text: string): string {
  if (!decodeNote(text).hidden) return text;
  const bits = findSlots(text).map((s) => s.bit);
  for (let i = 0; i < bits.length; i++) {
    const flipped = [...bits];
    flipped[i] = (1 - flipped[i]!) as 0 | 1;
    const candidate = writeBits(text, flipped);
    if (!decodeNote(candidate).hidden) return candidate;
  }
  return text; // unreachable in practice: flipping a check bit always breaks the check
}
