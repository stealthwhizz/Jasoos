import type { DialogueRequest, DialogueResponse, Npc, TickerEvent } from "@/lib/types";
import { zgCall } from "@/lib/zg";

/**
 * R7: one NPC reply. The rules live here in code, not only in the prompt:
 * the clue appears by the second reply and the chat closes after the third.
 */
export async function dialogueTurn(
  npc: Npc,
  req: DialogueRequest,
): Promise<DialogueResponse & { event: TickerEvent }> {
  const npcTurns = req.history.filter((m) => m.role === "npc").length;
  const { event } = await zgCall("dialogue", { persona: npc.persona, message: req.message });
  // TODO(A): build the prompt from persona + clue (never the secret), cap reply length,
  //   force the clue on the second reply if the model skipped it, moderate the line.
  const clueRevealed = npcTurns >= 1;
  const reply = clueRevealed ? npc.clue : `${npc.name} looks you over. "Ask what you came to ask."`;
  return { reply, clueRevealed, close: npcTurns >= 2, event };
}
