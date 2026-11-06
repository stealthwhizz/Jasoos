"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WorldSummary } from "@/lib/types";

type Source = "browser" | "server";

const GALLERY_LIMIT = 24;

/**
 * Reads live worlds straight from Arkiv in the browser, so the gallery needs no API of ours.
 * Falls back to /api/gallery (the same query run on the server) if Arkiv is off or unreachable.
 */
async function loadFromArkiv(): Promise<WorldSummary[] | null> {
  const cfg = (await fetch("/api/arkiv").then((r) => r.json())) as {
    mode: "arkiv" | "memory";
    project: string;
    accessKey: string;
  };
  if (cfg.mode !== "arkiv") return null;
  // Loaded on demand so the SDK stays out of the first page load.
  const [{ createPublicClient }, { rabdi }, { http }, { queryGallery }] = await Promise.all([
    import("@arkiv-network/sdk"),
    import("@arkiv-network/sdk/chains"),
    import("viem"),
    import("@/lib/arkiv/gallery"),
  ]);
  const reader = createPublicClient({
    chain: rabdi({ accessKey: cfg.accessKey }),
    transport: http(),
  });
  return queryGallery(reader, cfg.project, GALLERY_LIMIT);
}

async function loadFromServer(): Promise<WorldSummary[]> {
  const body = await fetch("/api/gallery").then((r) => r.json());
  return Array.isArray(body) ? body : [];
}

export function Gallery() {
  const [worlds, setWorlds] = useState<WorldSummary[] | null>(null);
  const [source, setSource] = useState<Source | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const direct = await loadFromArkiv();
        if (direct) {
          if (!cancelled) {
            setWorlds(direct);
            setSource("browser");
          }
          return;
        }
      } catch (err) {
        console.warn("Gallery: direct Arkiv read failed, using the server copy.", err);
      }
      const fallback = await loadFromServer().catch(() => []);
      if (!cancelled) {
        setWorlds(fallback);
        setSource("server");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!worlds) return <p className="text-neutral-400">Loading live cases…</p>;

  const sourceNote = (
    <p className="text-xs text-neutral-400" data-gallery-source={source ?? undefined}>
      {source === "browser"
        ? "Read live from Arkiv by your browser."
        : "Read through this app's server."}
    </p>
  );
  if (worlds.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-neutral-400">No live cases yet.</p>
        {sourceNote}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sourceNote}
      <ul className="grid gap-6 sm:grid-cols-2">
        {worlds.map((w) => (
          <li key={w.worldKey}>
            <Link
              href={`/world/${w.worldKey}`}
              className="block overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <img src={w.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
              <div className="space-y-1 p-5">
                <h2 className="font-semibold">{w.title}</h2>
                <p className="line-clamp-2 text-sm text-neutral-500">{w.premise}</p>
                <p className="text-xs text-neutral-400">{w.visits} visits</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
