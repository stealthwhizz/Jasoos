"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { JobEvent, TickerEvent } from "@/lib/types";
import { Ticker } from "./Ticker";

interface Status {
  creationPaused: boolean;
  verified: boolean;
  fixtures: boolean;
}

export function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [prompt, setPrompt] = useState("");
  const [events, setEvents] = useState<TickerEvent[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [worldId, setWorldId] = useState<string | null>(null);

  const loadStatus = () =>
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus);
  useEffect(() => {
    void loadStatus();
  }, []);

  // TODO(C): replace with IDKitRequestWidget from @worldcoin/idkit; post its result here as-is.
  async function verify() {
    const res = await fetch("/api/verify", {
      method: "POST",
      body: JSON.stringify({ fixture: true }),
    });
    setMessage(res.ok ? "" : ((await res.json()).error ?? "Verification failed."));
    await loadStatus();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setEvents([]);
    setWorldId(null);
    setMessage("");
    const res = await fetch("/api/worlds", { method: "POST", body: JSON.stringify({ prompt }) });
    const body = await res.json();
    if (body.event) setEvents([body.event]);
    if (!res.ok) {
      setMessage(body.error ?? "Could not start.");
      setBusy(false);
      return;
    }
    const source = new EventSource(`/api/worlds/${body.jobId}/events`);
    source.onmessage = (m) => {
      const ev = JSON.parse(m.data) as JobEvent;
      if (ev.type === "ticker") setEvents((prev) => [...prev, ev.event]);
      if (ev.type === "done") setWorldId(ev.worldId);
      if (ev.type === "error") setMessage(ev.message);
      if (ev.type === "done" || ev.type === "error") {
        source.close();
        setBusy(false);
      }
    };
    source.onerror = () => {
      source.close();
      setBusy(false);
    };
  }

  const canCreate = status?.verified && !status.creationPaused;

  return (
    <div className="space-y-10 pt-10">
      <section className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">One sentence. One case.</h1>
        <p className="max-w-xl text-lg text-neutral-500">
          Describe a scene. Walk the street it becomes, question the people inside, and name the
          culprit.
        </p>
        {status?.fixtures && (
          <p className="text-xs text-neutral-400">
            Running on fixture data. No model calls are made.
          </p>
        )}
      </section>

      <form onSubmit={create} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <label htmlFor="prompt" className="sr-only">
          Your scene
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="A rain-flooded night market where I carry a tiffin box someone will kill for"
          className="w-full resize-none rounded-xl bg-neutral-100 p-4 text-base outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="flex flex-wrap items-center gap-3">
          {status && !status.verified && (
            <button
              type="button"
              onClick={verify}
              className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium hover:bg-neutral-100"
            >
              Verify with World ID
            </button>
          )}
          <button
            type="submit"
            disabled={!canCreate || busy || !prompt.trim()}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Building…" : "Create world"}
          </button>
          {status && !status.verified && (
            <span className="text-sm text-neutral-500">
              Creating spends shared compute, so it needs proof of human. Anyone can play.
            </span>
          )}
          {status?.creationPaused && (
            <span className="text-sm text-neutral-500">
              Creation is paused. You can still play.
            </span>
          )}
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
        {worldId && (
          <Link href={`/world/${worldId}`} className="inline-block text-sm font-medium text-accent">
            Walk the world →
          </Link>
        )}
      </form>

      <Ticker events={events} />
    </div>
  );
}
