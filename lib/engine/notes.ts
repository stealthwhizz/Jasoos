import type { Location, Note, TickerEvent, WorldBible } from "@/lib/types";
import { env } from "@/lib/env";
import { ZgError, zgCall } from "@/lib/zg";
import { fixtureNotes } from "@/fixtures/world";
import { CODEBOOK } from "./codebook";
import { ALPHABET, SECRET_LEN, SLOTS, encodeNote, scrubNote } from "./codec";

/** The hidden code: the first letters of the culprit's name that fit the alphabet. */
export function codeFor(bible: WorldBible): string {
  const culprit = bible.locations.find((l) => l.npc.id === bible.mystery.culpritNpcId)?.npc;
  const letters = [...(culprit?.name.toUpperCase() ?? "")].filter((ch) => ALPHABET.includes(ch));
  return letters.join("").padEnd(SECRET_LEN, "A").slice(0, SECRET_LEN);
}

const ask = (bible: WorldBible, at: Location, hidden: boolean) =>
  [
    `Write one short everyday note (a letter, a list, or a courier slip) found in ${at.name}.`,
    `World: ${bible.premise}`,
    "It must read as ordinary small talk and must not mention any crime. 60 to 100 words.",
    hidden
      ? `Use at least ${SLOTS + 4} words from this list, spelled exactly as written: ${CODEBOOK.flat().join(", ")}.`
      : "",
    "Reply with the note text only.",
  ].join("\n");

async function write(bible: WorldBible, at: Location, hidden: boolean) {
  const { event, data } = await zgCall("plan", {
    messages: [{ role: "user", content: ask(bible, at, hidden) }],
    maxTokens: 300,
  });
  return { event, text: (data ?? "").trim() };
}

/**
 * R21: one note hides the code in its word choices; a second note is ordinary and scrubbed so the
 * Decoder never finds a message there by chance. A note that fails is left out.
 */
export async function writeNotes(
  bible: WorldBible,
): Promise<{ notes: Note[]; events: TickerEvent[] }> {
  if (env.useFixtures) return { notes: fixtureNotes, events: [] };
  const innocent = bible.locations.filter((l) => l.npc.id !== bible.mystery.culpritNpcId);
  const [hideIn, decoyIn] = [innocent[0]!, innocent[1] ?? innocent[0]!];
  const events: TickerEvent[] = [];
  const code = codeFor(bible);

  const hiddenNote = async (): Promise<Note | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { event, text } = await write(bible, hideIn, true);
      events.push(event);
      const encoded = encodeNote(code, text);
      if (encoded)
        return { id: `note-${hideIn.id}`, locationId: hideIn.id, text: encoded, hasHidden: true };
    }
    return null;
  };
  const decoyNote = async (): Promise<Note | null> => {
    const { event, text } = await write(bible, decoyIn, false);
    events.push(event);
    return text
      ? {
          id: `note-${decoyIn.id}-2`,
          locationId: decoyIn.id,
          text: scrubNote(text),
          hasHidden: false,
        }
      : null;
  };
  const safely = (f: () => Promise<Note | null>) =>
    f().catch((err) => {
      if (!(err instanceof ZgError)) throw err;
      events.push(err.event);
      return null;
    });

  const notes = await Promise.all([safely(hiddenNote), safely(decoyNote)]);
  return { notes: notes.filter((n): n is Note => n !== null), events };
}
