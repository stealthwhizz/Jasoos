"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicManifest } from "@/lib/types";
import { GameCanvas } from "@/components/GameCanvas";
import { DialoguePanel } from "@/components/DialoguePanel";
import { AccusationPanel } from "@/components/AccusationPanel";
import { Decoder } from "@/components/Decoder";

export function WorldView({ manifest }: { manifest: PublicManifest }) {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [clues, setClues] = useState<Set<string>>(new Set());
  const interiorHeadingRef = useRef<HTMLHeadingElement>(null);
  const { bible, worldId } = manifest;
  const location = bible.locations.find((l) => l.id === locationId);
  const interior = manifest.assets.find((a) => a.id === `interior-${locationId}`);

  useEffect(() => {
    void fetch(`/api/worlds/${worldId}/visit`, { method: "POST" });
  }, [worldId]);

  useEffect(() => {
    if (locationId) interiorHeadingRef.current?.focus();
  }, [locationId]);

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{bible.title}</h1>
          <p className="max-w-2xl text-neutral-500">{bible.premise}</p>
        </div>
        <p className="shrink-0 text-sm text-neutral-500">Evidence collected: {clues.size} / 3</p>
      </div>

      {location ? (
        <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 ref={interiorHeadingRef} tabIndex={-1} className="text-xl font-semibold">
              {location.name}
            </h2>
            <button
              type="button"
              onClick={() => setLocationId(null)}
              className="text-sm text-accent"
            >
              ← Back to the street
            </button>
          </div>
          {!interior || interior.status === "pending" ? (
            <div
              role="status"
              className="flex min-h-56 items-center justify-center rounded-xl bg-neutral-100 p-6 text-center"
            >
              <div>
                <p className="font-medium">Still building this room</p>
                <p className="mt-1 text-sm text-neutral-500">
                  The interior is generating. You can keep talking while it finishes.
                </p>
              </div>
            </div>
          ) : interior.status === "failed" ? (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-medium">This room image could not be generated.</p>
              <p className="mt-1 text-sm text-neutral-600">
                The case is still playable. Generation record: {interior.model} ·{" "}
                {interior.requestId}
              </p>
            </div>
          ) : (
            <figure>
              <img
                src={interior.url}
                alt={location.interiorDescription}
                className="w-full rounded-xl"
              />
              <figcaption className="mt-1 font-mono text-xs text-neutral-400">
                {interior.model} · {interior.requestId}
              </figcaption>
            </figure>
          )}
          <DialoguePanel
            key={location.npc.id}
            worldId={worldId}
            npc={location.npc}
            onClue={() => setClues((c) => new Set(c).add(location.npc.id))}
          />
          {manifest.notes
            .filter((n) => n.locationId === location.id)
            .map((n) => (
              <Decoder key={n.id} note={n} />
            ))}
        </section>
      ) : (
        <GameCanvas manifest={manifest} onEnter={setLocationId} />
      )}
      <AccusationPanel manifest={manifest} unlocked={clues.size >= 3} />
    </div>
  );
}
