"use client";

import { useState } from "react";
import type { DialogueMessage, Npc, TickerEvent } from "@/lib/types";

/** R7 UI: chat with one NPC. Shows the request ID of every NPC line (chain of custody). */
export function DialoguePanel({
  worldId,
  npc,
  onClue,
}: {
  worldId: string;
  npc: Pick<Npc, "id" | "name">;
  onClue: () => void;
}) {
  const [history, setHistory] = useState<Array<DialogueMessage & { requestId?: string }>>([]);
  const [input, setInput] = useState("");
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    const message = input.trim();
    setInput("");
    const res = await fetch("/api/dialogue", {
      method: "POST",
      body: JSON.stringify({
        worldId,
        npcId: npc.id,
        message,
        history: history.map(({ role, text }) => ({ role, text })),
      }),
    });
    const body = (await res.json()) as {
      reply?: string;
      clueRevealed?: boolean;
      close?: boolean;
      event?: TickerEvent;
      error?: string;
    };
    setHistory((h) => [
      ...h,
      { role: "player", text: message },
      { role: "npc", text: body.reply ?? body.error ?? "…", requestId: body.event?.requestId },
    ]);
    if (body.clueRevealed) onClue();
    if (body.close) setClosed(true);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-2 text-sm">
        {history.map((m, i) => (
          <li key={i} className={m.role === "npc" ? "text-neutral-900" : "text-neutral-500"}>
            <span className="font-medium">{m.role === "npc" ? npc.name : "You"}:</span> {m.text}
            {m.requestId && (
              <span className="ml-2 font-mono text-xs text-neutral-400">{m.requestId}</span>
            )}
          </li>
        ))}
      </ol>
      {closed ? (
        <p className="text-sm text-neutral-500">{npc.name} has nothing more to say.</p>
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <label htmlFor={`say-${npc.id}`} className="sr-only">
            Say something to {npc.name}
          </label>
          <input
            id={`say-${npc.id}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder={`Ask ${npc.name} something`}
            className="flex-1 rounded-full bg-neutral-100 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            disabled={busy}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      )}
    </div>
  );
}
