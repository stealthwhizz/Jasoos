import type { TickerEvent } from "@/lib/types";

const ev = (
  n: number,
  kind: TickerEvent["kind"],
  model: string,
  latencyMs: number,
): TickerEvent => ({
  id: `fx-ev-${n}`,
  kind,
  model,
  startedAt: new Date(Date.UTC(2026, 10, 6, 10, 0, n)).toISOString(),
  latencyMs,
  requestId: `fx-req-${String(n).padStart(4, "0")}`,
  status: "ok",
});

/** One full creation run, in the order the real pipeline emits it. */
export const fixtureTicker: TickerEvent[] = [
  ev(1, "moderation", "fixture-chat", 210),
  ev(2, "plan", "fixture-chat", 3400),
  ev(3, "image", "fixture-image", 5200),
  ev(4, "image", "fixture-image", 4100),
  ev(5, "image", "fixture-image", 6300),
  ev(6, "image", "fixture-image", 5900),
  ev(7, "image", "fixture-image", 6100),
  ev(8, "vision", "fixture-vision", 2700),
];
