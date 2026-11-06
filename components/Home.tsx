"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { JobEvent, TickerEvent } from "@/lib/types";
import { Ticker } from "./Ticker";
import { fetchClientJson } from "./clientRequest";

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
  const [verifying, setVerifying] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [worldId, setWorldId] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const loadStatus = useCallback(() => {
    const failureMessage = "Connection unavailable. Retry to check creation status.";
    return fetchClientJson<Status>("/api/status", failureMessage)
      .then(({ response, body }) => {
        if (
          !response.ok ||
          typeof body.creationPaused !== "boolean" ||
          typeof body.verified !== "boolean" ||
          typeof body.fixtures !== "boolean"
        ) {
          throw new Error(failureMessage);
        }
        setStatus(body);
      })
      .catch(() => {
        setStatus(null);
        setMessage(failureMessage);
      })
      .finally(() => setCheckingStatus(false));
  }, []);
  useEffect(() => {
    void loadStatus();
    return () => sourceRef.current?.close();
  }, [loadStatus]);

  // TODO(C): replace with IDKitRequestWidget from @worldcoin/idkit; post its result here as-is.
  async function verify() {
    if (verifying) return;
    setVerifying(true);
    setMessage("");
    const failureMessage = "Verification unavailable. Please try again.";
    try {
      const { response, body } = await fetchClientJson<{ verified?: boolean; error?: string }>(
        "/api/verify",
        failureMessage,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fixture: true }),
        },
      );
      if (!response.ok || body.verified !== true) {
        throw new Error(body.error ?? failureMessage);
      }
      setCheckingStatus(true);
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : failureMessage);
    } finally {
      setVerifying(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !status?.verified || status.creationPaused || !prompt.trim()) return;
    sourceRef.current?.close();
    sourceRef.current = null;
    setBusy(true);
    setEvents([]);
    setWorldId(null);
    setMessage("");
    const failureMessage = "Could not start the world. Please try again.";
    let streamStarted = false;
    try {
      const { response, body } = await fetchClientJson<{
        jobId?: string;
        event?: TickerEvent;
        error?: string;
      }>("/api/worlds", failureMessage, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (body.event) setEvents([body.event]);
      if (!response.ok || !body.jobId) throw new Error(body.error ?? failureMessage);
      const source = new EventSource(`/api/worlds/${body.jobId}/events`);
      sourceRef.current = source;
      const finish = (errorMessage?: string) => {
        source.close();
        sourceRef.current = null;
        if (errorMessage) setMessage(errorMessage);
        setBusy(false);
      };
      source.onmessage = (messageEvent) => {
        try {
          const jobEvent = JSON.parse(messageEvent.data) as JobEvent;
          if (jobEvent.type === "ticker") setEvents((previous) => [...previous, jobEvent.event]);
          if (jobEvent.type === "done") {
            if (!jobEvent.worldId) throw new Error(failureMessage);
            setWorldId(jobEvent.worldId);
            finish();
          }
          if (jobEvent.type === "error") finish(jobEvent.message || failureMessage);
        } catch {
          finish("Could not read creation progress. Please try again.");
        }
      };
      source.onerror = () =>
        finish("Connection lost while receiving creation progress. Please try again.");
      streamStarted = true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : failureMessage);
    } finally {
      if (!streamStarted) setBusy(false);
    }
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

      {!status && checkingStatus && <p role="status">Checking creation availability…</p>}
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
          {!status && !checkingStatus && (
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setCheckingStatus(true);
                void loadStatus();
              }}
              className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium hover:bg-neutral-100"
            >
              Retry creation status
            </button>
          )}
          {status && !status.verified && (
            <button
              type="button"
              onClick={verify}
              disabled={verifying}
              className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium hover:bg-neutral-100"
            >
              {verifying
                ? "Verifying…"
                : status.fixtures
                  ? "Verify demo session"
                  : "Verify with World ID"}
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
        {message && (
          <p role="alert" className="text-sm text-red-600">
            {message}
          </p>
        )}
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
