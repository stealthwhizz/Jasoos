import { describe, expect, it } from "vitest";
import { keySprite } from "@/lib/engine/sprite";

// 4x3 image, green background (with slight noise) and a red 2x1 figure at (1,1).
function image() {
  const px = Array.from({ length: 12 }, (_, i) =>
    i === 5 || i === 6 ? [200, 30, 30, 255] : [0, 250 - (i % 3), 0, 255],
  );
  return new Uint8ClampedArray(px.flat());
}

describe("sprite keying", () => {
  it("clears background pixels within tolerance and trims to the figure", () => {
    const rgba = image();
    expect(keySprite(rgba, 4, 3)).toEqual({ x: 1, y: 1, w: 2, h: 1 });
    expect(rgba[3]).toBe(0);
    expect(rgba[5 * 4 + 3]).toBe(255);
  });

  it("returns null when everything is background", () => {
    expect(keySprite(new Uint8ClampedArray(16).fill(255), 2, 2)).toBeNull();
  });
});
