import type { Door, TickerEvent, WalkMap } from "@/lib/types";
import { zgCall } from "@/lib/zg";
import { fixtureManifest } from "@/fixtures/world";

/** R4: vision pass on the street image, producing a walk grid and door rectangles. */
export async function analyzeStreet(
  streetUrl: string,
): Promise<{ walkMap: WalkMap; doors: Door[]; event: TickerEvent }> {
  const { event } = await zgCall("vision", { messages: [{ role: "user", content: streetUrl }] });
  // TODO(A): rasterize the returned polygons onto a 96x54 grid; retry once; on failure use the
  //   fallback (lower third walkable, doors in bible location order).
  return { walkMap: fixtureManifest.walkMap, doors: fixtureManifest.doors, event };
}
