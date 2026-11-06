import type { Door, WalkMap } from "@/lib/types";

export const GRID_COLS = 96;
export const GRID_ROWS = 54;
const MIN_WALKABLE = 0.05; // a map with less walkable ground than this is unusable

type Point = [number, number];

function inside([x, y]: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Marks a cell walkable when its centre lies inside any polygon (0..1 coordinates). */
export function rasterize(polygons: Point[][], cols = GRID_COLS, rows = GRID_ROWS): WalkMap {
  const cells = Array.from({ length: cols * rows }, (_, i) => {
    const centre: Point = [((i % cols) + 0.5) / cols, (Math.floor(i / cols) + 0.5) / rows];
    return polygons.some((p) => inside(centre, p));
  });
  return { cols, rows, cells };
}

/** Is the point (feet position, 0..1) on a walkable cell? Off-map is never walkable. */
export function isWalkable(map: WalkMap, x: number, y: number): boolean {
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return false;
  return map.cells[Math.floor(y * map.rows) * map.cols + Math.floor(x * map.cols)] ?? false;
}

/** PRD fallback: lower third walkable, doors in bible order along the building line. */
export function fallbackMap(locationIds: string[]): { walkMap: WalkMap; doors: Door[] } {
  const walkMap = rasterize([
    [
      [0, 2 / 3],
      [1, 2 / 3],
      [1, 1],
      [0, 1],
    ],
  ]);
  const w = 0.0625;
  const doors = locationIds.map((locationId, i) => ({
    id: `door-${locationId}`,
    locationId,
    x: (i + 0.5) / locationIds.length - w / 2,
    y: 0.5,
    w,
    h: 1 / 6,
  }));
  return { walkMap, doors };
}

const unit = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
const isPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && p.every(unit);

/**
 * Validates the vision model's JSON: { walkable: [[[x,y],...],...], doors: [{locationId,x,y,w,h}] }.
 * Returns null when it is unusable, so the caller can retry or fall back.
 */
export function parseVisionMap(
  raw: unknown,
  locationIds: string[],
): { walkMap: WalkMap; doors: Door[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const { walkable, doors } = raw as { walkable?: unknown; doors?: unknown };
  if (!Array.isArray(walkable) || !Array.isArray(doors)) return null;

  const polygons = walkable.filter(
    (p): p is Point[] => Array.isArray(p) && p.length >= 3 && p.every(isPoint),
  );
  const walkMap = rasterize(polygons);
  if (walkMap.cells.filter(Boolean).length < walkMap.cells.length * MIN_WALKABLE) return null;

  const parsed: Door[] = [];
  for (const locationId of locationIds) {
    const d = doors.find((x) => x?.locationId === locationId) as
      Record<string, unknown> | undefined;
    if (!d || ![d.x, d.y, d.w, d.h].every(unit)) return null;
    const [x, y, w, h] = [d.x, d.y, d.w, d.h] as number[];
    if (!w || !h || x! + w > 1 || y! + h > 1) return null;
    parsed.push({ id: `door-${locationId}`, locationId, x: x!, y: y!, w, h });
  }
  return { walkMap, doors: parsed };
}
