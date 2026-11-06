import type { DialogueRequest, DialogueResponse, Npc, TickerEvent } from "@/lib/types";
import { env } from "@/lib/env";
import { ZgError, zgCall } from "@/lib/zg";
import { applyDialogueRules, npcSystemPrompt } from "./dialogueRules";
import { moderate } from "./moderate";

/** R7: one NPC reply from the chat model, moderated, then held to the clue and turn rules. */
export async function dialogueTurn(
  npc: Npc,
  req: DialogueRequest,
): Promise<DialogueResponse & { event: TickerEvent }> {
  const npcTurns = req.history.filter((m) => m.role === "npc").length;
  let raw: string;
  let event: TickerEvent;
  try {
    const result = await zgCall("dialogue", {
      messages: [
        { role: "system", content: npcSystemPrompt(npc, npcTurns) },
        ...req.history.map((m) => ({
          role: m.role === "npc" ? ("assistant" as const) : ("user" as const),
          content: m.text,
        })),
        { role: "user", content: req.message },
      ],
      maxTokens: 150,
    });
    event = result.event;
    raw = env.useFixtures
      ? npcTurns === 0
        ? `${npc.name} looks you over. "Ask what you came to ask."`
        : `${npc.name} leans in.`
      : (result.data ?? "");
  } catch (err) {
    if (!(err instanceof ZgError)) throw err;
    event = err.event;
    raw = `${npc.name} doesn't seem to hear you.`;
  }
  if (!env.useFixtures && raw && !(await moderate(raw)).allowed) raw = `${npc.name} hesitates.`;
  return { ...applyDialogueRules(raw, npc, npcTurns), event };
}
