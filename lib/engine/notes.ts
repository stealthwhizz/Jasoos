import type { Location, Note, TickerEvent, WorldBible } from "@/lib/types";
import { zgCall } from "@/lib/zg";
import { CODEBOOK } from "./codebook";
import {
  encodeNote,
  ensureNothingHidden,
  findSlots,
  MAX_SECRET_LENGTH,
  slotsNeeded,
} from "./codec";

/**
 * R21: one note per interior. One of them hides a short code in its word choices; the others are
 * ordinary and are checked so the Decoder reports "nothing hidden" on them.
 */

/** Extra slots asked of the model beyond the minimum, so a few lost words do not break it. */
const SLOT_MARGIN = 4;

/** The code the hidden note carries: the culprit's name, letters only, up to 4 characters. */
export function noteSecret(bible: WorldBible): string {
  const culprit = bible.locations.find((l) => l.npc.id === bible.mystery.culpritNpcId)?.npc;
  const letters = (culprit?.name ?? "CLUE").toUpperCase().replace(/[^A-Z]/g, "");
  return (letters || "CLUE").slice(0, MAX_SECRET_LENGTH);
}

/** Hide the code away from the culprit's own building, so the note points elsewhere. */
export function hiddenNoteLocation(bible: WorldBible): Location {
  return bible.locations.find((l) => l.npc.id !== bible.mystery.culpritNpcId) ?? bible.locations[0];
}

// Fallback cover sentences. Codebook words are used only in ways where both variants read well.
const TEMPLATE = [
  "The shop was quiet and nearly empty when I locked up.",
  "A big man in a wet coat came in suddenly and seemed nervous.",
  "He had cash in his hand, which is unusual, and asked me to be quick.",
  "Maybe it was a mistake, but he was really polite about it.",
  "I often see him by the door, looking toward the lane.",
  "The bag below the counter is gone, and the store is a mess.",
  "Certainly he was in a hurry, and he did not look happy.",
  "Usually the regulars are honest, but tonight something feels strange.",
  "I will fix the lock soon and be more careful.",
  "The night was mostly loud and dirty, and the floor is still wet.",
  "Someone left a shiny photo on the table, and I am almost sure it is his.",
  "Order more tea soon; we are nearly out, and the regulars get angry.",
];

/** Ordinary notes get a few sentences so they look like the hidden one. */
const ORDINARY_MIN_SLOTS = 8;

/** Small seeded PRNG so a location always gets the same template order. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 2 ** 32;
  };
}

/** A note built from the template, shuffled per location, long enough for `minSlots`. */
export function templateNote(locationId: string, minSlots: number): string {
  const rand = seeded(locationId);
  const order = [...TEMPLATE];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const lines: string[] = [];
  for (const line of order) {
    lines.push(line);
    if (findSlots(lines.join(" ")).length >= minSlots) break;
  }
  return lines.join(" ");
}

export type NoteChat = (prompt: string) => Promise<{ text: string | null; event: TickerEvent }>;

const zgNoteChat: NoteChat = async (prompt) => {
  const { event, data } = await zgCall("plan", { prompt, maxTokens: 260 });
  const content =
    typeof data === "string"
      ? data
      : (data as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]
          ?.message?.content;
  return { text: typeof content === "string" ? content.trim() : null, event };
};

function coverPrompt(bible: WorldBible, location: Location, minSlots: number): string {
  const words = CODEBOOK.map(([a]) => a).join(", ");
  return [
    `Write a short everyday note found in "${location.name}" (${location.interiorDescription}).`,
    `Setting: ${bible.premise}`,
    `It could be a ledger line, a reminder, a shopping list, or a message. 3 to 6 sentences.`,
    `Use at least ${minSlots} words from this list, exactly as written, not plural or past tense:`,
    words,
    `Do not mention secrets, codes, or the mystery. Return only the note text.`,
  ].join("\n");
}

/** Asks the model for a cover with enough slots, retries once, then falls back to the template. */
async function cover(
  bible: WorldBible,
  location: Location,
  minSlots: number,
  chat: NoteChat,
  events: TickerEvent[],
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, event } = await chat(coverPrompt(bible, location, minSlots + SLOT_MARGIN));
    events.push(event);
    if (text && findSlots(text).length >= minSlots) return text.replace(/\s+/g, " ");
    if (!text) break; // no model text at all (fixtures): retrying will not help
  }
  return templateNote(location.id, minSlots);
}

export async function generateNotes(
  bible: WorldBible,
  chat: NoteChat = zgNoteChat,
): Promise<{ notes: Note[]; events: TickerEvent[] }> {
  const secret = noteSecret(bible);
  const needed = slotsNeeded(secret);
  const hiddenAt = hiddenNoteLocation(bible).id;
  const events: TickerEvent[] = [];

  const notes = await Promise.all(
    bible.locations.map(async (location): Promise<Note> => {
      const hasHidden = location.id === hiddenAt;
      const text = await cover(
        bible,
        location,
        hasHidden ? needed : ORDINARY_MIN_SLOTS,
        chat,
        events,
      );
      return {
        id: `note-${location.id}`,
        locationId: location.id,
        text: hasHidden ? encodeNote(secret, text) : ensureNothingHidden(text),
        hasHidden,
      };
    }),
  );
  return { notes, events };
}
