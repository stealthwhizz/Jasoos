/**
 * Keys out the sprite's flat background (the colour of the top-left pixel) in place and returns
 * the bounding box of what is left. Browser-safe: pass ImageData.data from a canvas.
 */
export function keySprite(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 48,
): { x: number; y: number; w: number; h: number } | null {
  const [br, bg, bb] = [rgba[0]!, rgba[1]!, rgba[2]!];
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const d = Math.hypot(rgba[o]! - br, rgba[o + 1]! - bg, rgba[o + 2]! - bb);
    if (d <= tolerance) {
      rgba[o + 3] = 0;
      continue;
    }
    const x = i % width;
    const y = Math.floor(i / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
