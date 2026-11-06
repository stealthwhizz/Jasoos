import type { TickerEvent, WorldBible } from "@/lib/types";
import { env } from "@/lib/env";
import { parseJson, zgCall } from "@/lib/zg";
import { fixtureBible } from "@/fixtures/world";
import { parseBible } from "./bible";

const SYSTEM = `You design a small detective world for a browser game from one sentence.
Reply only with JSON in exactly this shape:
{"title": "", "premise": "", "artStyle": "", "streetDescription": "", "protagonist": "",
 "locations": [{"id": "", "name": "", "interiorDescription": "",
                "npc": {"id": "", "name": "", "persona": "", "clue": ""}}],
 "mystery": {"secret": "", "finalePrompt": "", "culpritNpcId": ""}}
Rules:
- Exactly 3 locations, each a building on one street, each with one NPC.
- Each NPC holds one clue. Together the clues point to the culprit, who is one of the 3 NPCs.
- culpritNpcId is the culprit's npc.id. No clue states the secret outright.
- premise: one paragraph that frames the player as the detective.
- artStyle: a few style words reused in every image prompt.
- streetDescription: the 3 buildings side by side, left to right in location order, doors clearly visible, a walkable pavement in front.
- protagonist: what the detective looks like.
- finalePrompt: an image prompt for the moment the culprit is caught.
- Suitable for all ages.`;

/** R2: one chat call in JSON mode, validated against the bible schema, retried once. */
export async function planWorld(
  prompt: string,
): Promise<{ bible: WorldBible; events: TickerEvent[] }> {
  const events: TickerEvent[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const { event, data } = await zgCall("plan", {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      json: true,
      maxTokens: 2000,
    });
    events.push(event);
    if (env.useFixtures) return { bible: fixtureBible, events };
    const bible = parseBible(parseJson(data));
    if (bible) return { bible, events };
  }
  throw new Error("Could not plan this world. Try a different sentence.");
}
