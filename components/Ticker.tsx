import type { TickerEvent } from "@/lib/types";

/** R9: every model call with its kind, model, latency, and 0G request ID. */
export function Ticker({ events }: { events: TickerEvent[] }) {
  return (
    <section aria-label="Generation ticker" className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-medium text-neutral-500">Generation ticker</h2>
      {events.length === 0 ? (
        <p className="text-sm text-neutral-400">Model calls appear here as the world builds.</p>
      ) : (
        <ol aria-live="polite" className="divide-y divide-neutral-100 text-sm">
          {events.map((e) => (
            <li key={e.id} className="grid grid-cols-[6rem_1fr_5rem] items-center gap-3 py-2">
              <span className="font-medium capitalize">{e.kind}</span>
              <span className="truncate font-mono text-xs text-neutral-500">
                {e.model} · {e.requestId}
              </span>
              <span
                className={`text-right tabular-nums ${e.status === "ok" ? "text-neutral-600" : "text-red-600"}`}
              >
                {e.status === "ok" ? `${e.latencyMs} ms` : "failed"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
