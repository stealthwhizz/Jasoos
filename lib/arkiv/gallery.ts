import { and, desc, eq } from "@arkiv-network/sdk/query";
import type { createPublicClient } from "@arkiv-network/sdk";
import { bytesToString, hexToBytes } from "viem";
import type { WorldSummary } from "@/lib/types";
import { VisitEntity, WorldEntity } from "./schemas";

// The gallery query. Browser-safe (no Node imports): the gallery page runs it straight against
// Arkiv, and the server runs the same code behind /api/gallery as a fallback.

type Reader = ReturnType<typeof createPublicClient>;

/** Anyone can run this: live worlds for one project, newest first, sorted by the node. */
export async function queryGallery(
  reader: Reader,
  project: string,
  limit: number,
): Promise<WorldSummary[]> {
  const page = await reader
    .select({ $key: true, title: true, createdAt: true, summary: true })
    .from(WorldEntity)
    .where(and(eq("project", project), eq("entityType", "world")))
    .orderBy(desc("createdAt"))
    .limit(limit)
    .fetch();
  return Promise.all(
    page.entities.map(async (row) => {
      let summary = { premise: "", thumbnailUrl: "" };
      try {
        summary = JSON.parse(bytesToString(hexToBytes(row.summary.value)));
      } catch {
        // A malformed summary still lists the world, without a premise or picture.
      }
      const visits = await reader
        .count()
        .from(VisitEntity)
        .where(and(eq("project", project), eq("entityType", "visit"), eq("worldKey", row.$key)))
        .fetch();
      return {
        worldKey: row.$key,
        title: row.title.value,
        premise: summary.premise,
        thumbnailUrl: summary.thumbnailUrl,
        createdAt: new Date(Number(row.createdAt.value)).toISOString(),
        visits: Number(visits),
      };
    }),
  );
}
