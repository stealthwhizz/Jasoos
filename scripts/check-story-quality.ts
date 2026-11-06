import "./env";
import { generateBible, unseal } from "../lib/world-engine";
import { decodeNote } from "../lib/engine/codec";
import type { Mystery } from "../lib/universe";

/** Compare the same two cases with ZG_CHAT_THINKING=on/off in separate processes. */
async function main() {
  for (const idea of ["A missing ledger in a Mumbai tiffin shop", "A stolen theatre mask in Jaipur"]) {
    const start = performance.now();
    const bible = await generateBible(idea);
    const mystery = unseal<Mystery>(bible.story.sealed);
    console.log(JSON.stringify({
      idea, thinking: process.env.ZG_CHAT_THINKING ?? "off", elapsedMs: Math.round(performance.now() - start),
      culpritValid: [0, 1, 2].includes(mystery.culprit),
      rooms: bible.rooms.length,
      objects: bible.rooms.filter((r) => r.object?.name && r.object.description).length,
      notes: bible.rooms.filter((r) => r.object?.note).length,
      decodableNotes: bible.rooms.filter((r) => r.object?.note && decodeNote(r.object.note, mystery.key).hidden).length,
      hasFallback: Boolean(mystery.evidenceNote),
    }));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
