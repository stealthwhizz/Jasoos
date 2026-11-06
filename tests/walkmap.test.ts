import { describe, expect, it } from "vitest";
import { fallbackMap, isWalkable, parseVisionMap, rasterize } from "@/lib/engine/walkMap";

const ids = ["cafe", "depot", "pawn"];
const square = [
  [0.25, 0.5],
  [0.75, 0.5],
  [0.75, 1],
  [0.25, 1],
] as [number, number][];
const door = (locationId: string, x: number) => ({ locationId, x, y: 0.3, w: 0.05, h: 0.2 });

describe("walk map", () => {
  it("rasterizes walkable polygons onto the grid", () => {
    const map = rasterize([square], 8, 4);
    // Rows 2-3, columns 2-5 are inside.
    expect(map.cells.filter(Boolean)).toHaveLength(8);
    expect(map.cells[2 * 8 + 2]).toBe(true);
    expect(map.cells[2 * 8 + 1]).toBe(false);
    expect(map.cells[1 * 8 + 3]).toBe(false);
  });

  it("allows a move only when the feet land on a walkable cell", () => {
    const map = rasterize([square]);
    expect(isWalkable(map, 0.5, 0.75)).toBe(true);
    expect(isWalkable(map, 0.1, 0.75)).toBe(false);
    expect(isWalkable(map, 0.5, 0.25)).toBe(false);
    expect(isWalkable(map, 0.5, 1)).toBe(false);
    expect(isWalkable(map, -0.01, 0.75)).toBe(false);
  });

  it("falls back to the lower third walkable with doors in bible order", () => {
    const { walkMap, doors } = fallbackMap(ids);
    expect(isWalkable(walkMap, 0.5, 0.9)).toBe(true);
    expect(isWalkable(walkMap, 0.5, 0.5)).toBe(false);
    expect(doors.map((d) => d.locationId)).toEqual(ids);
    expect(doors[0]!.x).toBeLessThan(doors[1]!.x);
  });

  it("accepts valid vision output", () => {
    const out = parseVisionMap(
      { walkable: [square], doors: [door("pawn", 0.8), door("cafe", 0.1), door("depot", 0.45)] },
      ids,
    );
    expect(out?.doors.map((d) => d.id)).toEqual(["door-cafe", "door-depot", "door-pawn"]);
  });

  it("rejects invalid or empty vision output", () => {
    const doors = ids.map((id, i) => door(id, i * 0.3));
    expect(parseVisionMap(null, ids)).toBeNull();
    expect(parseVisionMap({ walkable: [], doors }, ids)).toBeNull();
    expect(parseVisionMap({ walkable: [square], doors: doors.slice(1) }, ids)).toBeNull();
    expect(
      parseVisionMap({ walkable: [square], doors: [...doors.slice(1), door("cafe", 0.99)] }, ids),
    ).toBeNull();
    expect(
      parseVisionMap(
        {
          walkable: [
            [
              [0, 0],
              [2, 0],
              [0, 1],
            ],
          ],
          doors,
        },
        ids,
      ),
    ).toBeNull();
  });
});
