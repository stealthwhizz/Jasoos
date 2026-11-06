import { randomUUID } from "node:crypto";
import type { TickerEvent, TickerKind } from "@/lib/types";
import { env, processStore } from "@/lib/env";
import { fixtureTicker } from "@/fixtures/ticker";

export interface ZgResult {
  event: TickerEvent;
  data: unknown;
}

/** Every 0G call this process made, oldest first. The provenance trail behind the ticker. */
export const requestLog = processStore<TickerEvent[]>("zgRequestLog", () => []);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The only way the app talks to 0G Private Computer. Records model, latency, and request ID.
 * TODO(A): real mode — OpenAI client at ZG_COMPUTE_BASE_URL with ZG_COMPUTE_API_KEY;
 *   chat.completions for moderation/plan/dialogue, vision for `vision`, images for `image`.
 *   Use `.withResponse()` to read request_id. Timeout per kind, one retry, status "failed" on error.
 */
export async function zgCall(kind: TickerKind, payload: unknown): Promise<ZgResult> {
  if (!env.useFixtures) throw new Error(`zgCall(${kind}): real 0G calls not implemented (TODO(A))`);
  void payload;

  const started = Date.now();
  const sample = fixtureTicker.find((e) => e.kind === kind);
  // Fixture latency is scaled down so the demo ticker visibly streams without a long wait.
  await sleep((sample?.latencyMs ?? 500) / 5);
  const event: TickerEvent = {
    id: randomUUID(),
    kind,
    model: sample?.model ?? `fixture-${kind}`,
    startedAt: new Date(started).toISOString(),
    latencyMs: Date.now() - started,
    requestId: `fx-${randomUUID().slice(0, 8)}`,
    status: "ok",
  };
  requestLog.push(event);
  return { event, data: null };
}
