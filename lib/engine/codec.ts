import { CODEBOOK } from "./codebook";

// Secret = SECRET_LEN letters from a 16-letter alphabet (4 bits each) + a 4-bit check value.
export const ALPHABET = "ABCDEKLMNOPRSTUY";
export const SECRET_LEN = 3;
/** Codebook words a note needs to carry one secret. */
export const SLOTS = (SECRET_LEN + 1) * 4;

export interface DecodeResult {
  hidden: boolean;
  secret?: string;
  /** Character ranges of the words that carry the secret, for the Decoder to highlight. */
  marks: Array<{ start: number; end: number }>;
}

const PAIR_OF = new Map(CODEBOOK.flatMap((pair, i) => pair.map((w) => [w, i] as const)));
const WORD_RE = new RegExp(`\\b(${[...PAIR_OF.keys()].join("|")})\\b`, "gi");

/** Single-nibble changes always change the check, because 3 is invertible mod 16. */
const check = (nibbles: number[]) => nibbles.reduce((c, n) => (c * 3 + n + 1) % 16, 0);

function slots(text: string) {
  return [...text.matchAll(WORD_RE)].map((m) => {
    const word = m[0].toLowerCase();
    const pair = CODEBOOK[PAIR_OF.get(word)!]!;
    return { start: m.index, end: m.index + m[0].length, word, pair, bit: pair.indexOf(word) };
  });
}

const toBits = (nibbles: number[]) => nibbles.flatMap((n) => [3, 2, 1, 0].map((s) => (n >> s) & 1));
const matchCase = (like: string, word: string) =>
  like[0] === like[0]!.toUpperCase() ? word[0]!.toUpperCase() + word.slice(1) : word;

export function isValidSecret(secret: string): boolean {
  return secret.length === SECRET_LEN && [...secret].every((ch) => ALPHABET.includes(ch));
}

/** Writes the secret into the cover's word choices. Null if the cover has too few slots. */
export function encodeNote(secret: string, coverText: string): string | null {
  if (!isValidSecret(secret)) throw new Error(`Secret must be ${SECRET_LEN} of ${ALPHABET}`);
  const found = slots(coverText);
  if (found.length < SLOTS) return null;
  const nibbles = [...secret].map((ch) => ALPHABET.indexOf(ch));
  const bits = toBits([...nibbles, check(nibbles)]);
  let out = "";
  let at = 0;
  found.slice(0, SLOTS).forEach((s, i) => {
    out +=
      coverText.slice(at, s.start) + matchCase(coverText.slice(s.start, s.end), s.pair[bits[i]!]!);
    at = s.end;
  });
  return out + coverText.slice(at);
}

/** Reads the first SLOTS codebook words as bits and verifies the check value. */
export function decodeNote(text: string): DecodeResult {
  const found = slots(text).slice(0, SLOTS);
  if (found.length < SLOTS) return { hidden: false, marks: [] };
  const nibbles = Array.from({ length: SECRET_LEN + 1 }, (_, i) =>
    found.slice(i * 4, i * 4 + 4).reduce((n, s) => (n << 1) | s.bit, 0),
  );
  const data = nibbles.slice(0, SECRET_LEN);
  if (check(data) !== nibbles[SECRET_LEN]) return { hidden: false, marks: [] };
  return {
    hidden: true,
    secret: data.map((n) => ALPHABET[n]).join(""),
    marks: found.map(({ start, end }) => ({ start, end })),
  };
}

/** Makes sure an ordinary note does not decode by chance, by flipping its last check bit. */
export function scrubNote(text: string): string {
  if (!decodeNote(text).hidden) return text;
  const s = slots(text)[SLOTS - 1]!;
  const flipped = matchCase(text.slice(s.start, s.end), s.pair[1 - s.bit]!);
  return text.slice(0, s.start) + flipped + text.slice(s.end);
}
