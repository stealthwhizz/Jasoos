"use client";

import { useState } from "react";
import type { DialogueMessage, Npc, TickerEvent } from "@/lib/types";
import { fetchClientJson } from "./clientRequest";

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
  const [error, setError] = useState("");

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || closed || !input.trim()) return;
    setBusy(true);
    setError("");
    const message = input.trim();
    const failureMessage =
      "Could not reach this character. Your question is saved; please try again.";
    try {
      const { response, body } = await fetchClientJson<{
        reply?: string;
        clueRevealed?: boolean;
        close?: boolean;
        event?: TickerEvent;
        error?: string;
      }>("/api/dialogue", failureMessage, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldId,
          npcId: npc.id,
          message,
          history: history.map(({ role, text }) => ({ role, text })),
        }),
      });
      if (!response.ok || typeof body.reply !== "string") {
        throw new Error(body.error ?? failureMessage);
      }
      const reply = body.reply;
      setHistory((previous) => [
        ...previous,
        { role: "player", text: message },
        { role: "npc", text: reply, requestId: body.event?.requestId },
      ]);
      setInput("");
      if (body.clueRevealed) onClue();
      if (body.close) setClosed(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : failureMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        role="log"
        aria-label={`Conversation with ${npc.name}`}
        aria-live="polite"
        aria-relevant="additions text"
        className="space-y-2 text-sm"
      >
        {history.map((m, i) => (
          <p key={i} className={m.role === "npc" ? "text-neutral-900" : "text-neutral-500"}>
            <span className="font-medium">{m.role === "npc" ? npc.name : "You"}:</span> {m.text}
            {m.requestId && (
              <span className="ml-2 font-mono text-xs text-neutral-400">{m.requestId}</span>
            )}
          </p>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {closed ? (
        <p role="status" className="text-sm text-neutral-500">
          {npc.name} has nothing more to say.
        </p>
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <label htmlFor={`say-${npc.id}`} className="sr-only">
            Say something to {npc.name}
          </label>
          <input
            id={`say-${npc.id}`}
            value={input}
            readOnly={busy}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder={`Ask ${npc.name} something`}
            className="min-w-0 flex-1 rounded-full bg-neutral-100 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            disabled={busy || !input.trim()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      )}
    </div>
  );
}
