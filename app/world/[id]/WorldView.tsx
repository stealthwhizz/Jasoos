"use client";

import { useEffect, useState } from "react";
import type { PublicManifest } from "@/lib/types";
import { GameCanvas } from "@/components/GameCanvas";
import { DialoguePanel } from "@/components/DialoguePanel";
import { Decoder } from "@/components/Decoder";

export function WorldView({ manifest }: { manifest: PublicManifest }) {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [clues, setClues] = useState<Set<string>>(new Set());
  const { bible, worldId } = manifest;
  const location = bible.locations.find((l) => l.id === locationId);
  const interior = manifest.assets.find((a) => a.id === `interior-${locationId}`);

  useEffect(() => {
    void fetch(`/api/worlds/${worldId}/visit`, { method: "POST" });
  }, [worldId]);

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{bible.title}</h1>
          <p className="max-w-2xl text-neutral-500">{bible.premise}</p>
        </div>
        <p className="shrink-0 text-sm text-neutral-500">Clues {clues.size} / 3</p>
      </div>

      {location ? (
        <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{location.name}</h2>
            <button onClick={() => setLocationId(null)} className="text-sm text-accent">
              ← Back to the street
            </button>
          </div>
          {/* TODO(B): "still building" for pending interiors, labelled placeholder for failed (R6). */}
          {interior && (
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
        <>
          <GameCanvas manifest={manifest} onEnter={setLocationId} />
          <p className="text-sm text-neutral-500">
            Arrow keys or WASD to move. Stand at a lit door and press E to enter.
          </p>
        </>
      )}
      {/* TODO(B): accusation picker after 3 clues, POST /api/worlds/[id]/accuse, then the finale (R8). */}
    </div>
  );
}
