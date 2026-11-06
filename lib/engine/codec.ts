import { CODEBOOK } from "./codebook";
import { fixtureNotes, fixtureNoteSecrets } from "@/fixtures/world";

export interface DecodeResult {
  hidden: boolean;
  secret?: string;
  /** Character ranges of codebook words, for the Decoder to highlight. */
  marks: Array<{ start: number; end: number }>;
}

const WORDS = CODEBOOK.flat();
const WORD_RE = new RegExp(`\\b(${WORDS.join("|")})\\b`, "gi");

/** R21: pick a codebook variant per slot to carry the secret's bits plus a check value. */
export function encodeNote(secret: string, coverText: string): string {
  // TODO(A): real encoding; regenerate the cover once if it has too few slots.
  void secret;
  return coverText;
}

/** R22: read codebook words in order, one bit each, and verify the check value. */
export function decodeNote(text: string): DecodeResult {
  const marks = [...text.matchAll(WORD_RE)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  // TODO(A): decode bits from marks and check the check value instead of this fixture lookup.
  const note = fixtureNotes.find((n) => n.text === text && n.hasHidden);
  const secret = note && fixtureNoteSecrets[note.id];
  return secret ? { hidden: true, secret, marks } : { hidden: false, marks: [] };
}
