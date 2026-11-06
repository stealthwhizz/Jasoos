import type { TickerEvent } from "@/lib/types";
import { env } from "@/lib/env";
import { ZgError, parseJson, zgCall } from "@/lib/zg";

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  event?: TickerEvent;
}

const SYSTEM = `You check text for a detective game that anyone may play.
Refuse: sexual content, harm to minors, real private people, hate, self-harm, graphic gore.
Allow: crime, mystery, theft, mild peril, fictional villains.
Reply only with JSON: {"allowed": true or false, "reason": "<one short sentence for the player>"}`;

/** R1: runs on every prompt and every generated NPC line. Fails closed. */
export async function moderate(text: string): Promise<ModerationResult> {
  if (!text.trim()) return { allowed: false, reason: "The prompt is empty." };
  try {
    const { event, data } = await zgCall("moderation", {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
      json: true,
      maxTokens: 120,
    });
    if (env.useFixtures) return { allowed: true, event };
    const verdict = parseJson(data) as { allowed?: unknown; reason?: unknown } | null;
    if (verdict?.allowed === true) return { allowed: true, event };
    const reason = typeof verdict?.reason === "string" && verdict.reason.trim();
    return { allowed: false, reason: reason || "This text could not be cleared.", event };
  } catch (err) {
    if (!(err instanceof ZgError)) throw err;
    return { allowed: false, reason: "Safety check is unavailable. Try again.", event: err.event };
  }
}
