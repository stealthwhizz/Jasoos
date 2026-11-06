"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WorldSummary } from "@/lib/types";

/** Live worlds. TODO(C): read Arkiv straight from the browser; fall back to /api/gallery. */
export function Gallery() {
  const [worlds, setWorlds] = useState<WorldSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/gallery")
      .then((r) => r.json())
      .then(setWorlds)
      .catch(() => setWorlds([]));
  }, []);

  if (!worlds) return <p className="text-neutral-400">Loading live cases…</p>;
  if (worlds.length === 0) return <p className="text-neutral-400">No live cases yet.</p>;

  return (
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
  );
}
