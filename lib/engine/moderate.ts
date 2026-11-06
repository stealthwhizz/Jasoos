import type { TickerEvent } from "@/lib/types";
import { zgCall } from "@/lib/zg";

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  event: TickerEvent;
}

/** R1: runs on every prompt and every generated NPC line before it reaches the player. */
export async function moderate(text: string): Promise<ModerationResult> {
  const { event } = await zgCall("moderation", { messages: [{ role: "user", content: text }] });
  // TODO(A): parse the model's verdict from zgCall data instead of this fixture rule.
  if (!text.trim()) return { allowed: false, reason: "The prompt is empty.", event };
  return { allowed: true, event };
}
