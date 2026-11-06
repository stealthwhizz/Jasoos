import type { TickerEvent, WorldBible } from "@/lib/types";
import { zgCall } from "@/lib/zg";
import { fixtureBible } from "@/fixtures/world";

/** R2: one chat call with a JSON schema for the world bible. */
export async function planWorld(
  prompt: string,
): Promise<{ bible: WorldBible; event: TickerEvent }> {
  const { event } = await zgCall("plan", { prompt });
  // TODO(A): validate zgCall data against the bible schema; retry once if invalid.
  return { bible: fixtureBible, event };
}
