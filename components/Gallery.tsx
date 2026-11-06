"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchClientJsonValue } from "./clientRequest";
import { parseGallery } from "./galleryData";
import type { WorldSummary } from "@/lib/types";

/** Live worlds. TODO(C): read Arkiv straight from the browser; fall back to /api/gallery. */
export function Gallery() {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  const [worlds, setWorlds] = useState<WorldSummary[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchClientJsonValue("/api/gallery", "Gallery unavailable", { signal: controller.signal })
      .then(({ response, body }) => {
        if (!response.ok) throw new Error("Gallery unavailable");
        return body;
      })
      .then(parseGallery)
      .then((worlds) => {
        if (!controller.signal.aborted) setWorlds(worlds);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);

  if (error)
    return (
      <div role="alert" className="case-panel">
        The case archive is unavailable.{" "}
        <button
          className="case-button secondary"
          onClick={() => {
            setError(false);
            setWorlds(null);
            setAttempt((value) => value + 1);
          }}
        >
          Retry gallery
        </button>
      </div>
    );
  if (!worlds)
    return (
      <div role="status" aria-label="Loading live cases" className="gallery-grid">
        {[1, 2, 3].map((n) => (
          <div key={n} className="case-panel skeleton" />
        ))}
      </div>
    );
  if (worlds.length === 0) return <p className="text-neutral-400">No live cases yet.</p>;

  return (
    <ul className="gallery-grid">
      {worlds.map((w) => (
        <li key={w.worldKey}>
          <Link href={`/world/${w.worldKey}`} prefetch={false} className="world-card">
            <img src={w.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
            <div className="world-card-content">
              <p className="eyebrow">OPEN CASE / EXPLORE</p>
              <h2 className="font-semibold">{w.title}</h2>
              <p className="line-clamp-2 text-sm text-neutral-500">{w.premise}</p>
              <div className="world-card-footer">
                <span>{w.visits} visits</span>
                <span>Investigate ↗</span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
