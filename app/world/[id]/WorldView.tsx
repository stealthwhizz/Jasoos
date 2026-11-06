"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicManifest } from "@/lib/types";
import { GameCanvas } from "@/components/GameCanvas";
import { DialoguePanel } from "@/components/DialoguePanel";
import { AccusationPanel } from "@/components/AccusationPanel";
import { InteriorArtwork } from "@/components/InteriorArtwork";
import { Decoder } from "@/components/Decoder";

export function WorldView({ manifest }: { manifest: PublicManifest }) {
  const [visitFailed, setVisitFailed] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [clues, setClues] = useState<Set<string>>(new Set());
  const interiorHeadingRef = useRef<HTMLHeadingElement>(null);
  const { bible, worldId } = manifest;
  const location = bible.locations.find((l) => l.id === locationId);
  const interior = manifest.assets.find((a) => a.id === `interior-${locationId}`);

  useEffect(() => {
    let active = true;
    void fetch(`/api/worlds/${encodeURIComponent(worldId)}/visit`, { method: "POST" })
      .then((response) => {
        if (!response.ok) throw new Error("Visit was not recorded");
      })
      .catch(() => {
        if (active) setVisitFailed(true);
      });
    return () => {
      active = false;
    };
  }, [worldId]);

  useEffect(() => {
    if (locationId) interiorHeadingRef.current?.focus();
  }, [locationId]);

  return (
    <div className="game-shell">
      {visitFailed && (
        <p role="status" className="text-sm text-neutral-600">
          Visit activity could not be recorded. You can keep investigating.
        </p>
      )}
      <div className="world-hud">
        <div>
          <p className="eyebrow">Case file / {location?.name ?? "Street investigation"}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{bible.title}</h1>
          <p className="max-w-2xl text-neutral-500">{bible.premise}</p>
        </div>
        <div className="evidence-tracker">
          <div>
            <p className="eyebrow">
              {clues.size >= 3 ? "Ready for accusation" : "Investigation open"}
            </p>
            <p className="text-sm">Evidence collected: {clues.size} / 3</p>
          </div>
          <div className="evidence-slots" role="group" aria-label="Evidence tracker">
            {bible.locations.map(({ npc }, i) => (
              <span
                key={npc.id}
                role="img"
                className={`evidence-slot ${clues.has(npc.id) ? "collected" : ""}`}
                aria-label={`${npc.name}: ${clues.has(npc.id) ? "clue collected" : "clue missing"}`}
              >
                {clues.has(npc.id) ? "✓" : `0${i + 1}`}
              </span>
            ))}
          </div>
        </div>
      </div>

      {location ? (
        <section className="case-panel interior-panel">
          <div className="interior-top">
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
          <InteriorArtwork
            key={`${location.id}:${interior?.status}:${interior?.url}`}
            asset={interior}
            description={location.interiorDescription}
          />
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
