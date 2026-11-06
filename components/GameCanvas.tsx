"use client";

import { useEffect, useRef } from "react";
import type { PublicManifest } from "@/lib/types";
import { isWalkable } from "@/lib/engine/walkMap";
import { keySprite } from "@/lib/engine/sprite";

const W = 960;
const H = 540;
const SPEED = 0.25; // fraction of the scene per second
const SPRITE_HEIGHT = 96;
const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  w: [0, -1],
  s: [0, 1],
};

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

/** R5: draws the street and sprite; arrows or WASD move, E enters the nearest door. */
export function GameCanvas({
  manifest,
  onEnter,
}: {
  manifest: PublicManifest;
  onEnter: (locationId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onEnterRef = useRef(onEnter);
  useEffect(() => {
    onEnterRef.current = onEnter;
  }, [onEnter]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const url = (kind: string) => manifest.assets.find((a) => a.kind === kind)?.url ?? "";
    const street = loadImage(url("street"));
    const sprite = loadImage(url("sprite"));
    const pos = { x: 0.5, y: 0.85, facing: 1 }; // feet position, 0..1
    const held = new Set<string>();
    let spriteSource: CanvasImageSource = sprite;
    let trim: { x: number; y: number; w: number; h: number } | null = null;
    sprite.onload = () => {
      const buffer = document.createElement("canvas");
      buffer.width = sprite.naturalWidth;
      buffer.height = sprite.naturalHeight;
      const context = buffer.getContext("2d");
      if (!context) return;
      context.drawImage(sprite, 0, 0);
      try {
        const pixels = context.getImageData(0, 0, buffer.width, buffer.height);
        // Already transparent fixture sprites must retain their authored colors.
        if (pixels.data[3] !== 0) {
          trim = keySprite(pixels.data, buffer.width, buffer.height);
          if (trim) {
            context.putImageData(pixels, 0, 0);
            spriteSource = buffer;
          }
        }
      } catch {
        // Cross-origin images without CORS remain drawable in their original form.
      }
    };

    // The door whose bottom edge is closest to the feet, if within reach.
    const nearDoor = () =>
      manifest.doors.find(
        (d) =>
          Math.abs(pos.x - (d.x + d.w / 2)) < Math.max(d.w, 0.045) &&
          Math.abs(pos.y - (d.y + d.h)) < 0.22,
      );

    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && e.target.closest("input, textarea") !== null;
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key in KEYS) {
        held.add(key);
        e.preventDefault();
      }
      if (key === "e") {
        const door = nearDoor();
        if (door) onEnterRef.current(door.locationId);
      }
    };
    const up = (e: KeyboardEvent) => held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const clearHeld = () => held.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clearHeld);

    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      let dx = 0;
      let dy = 0;
      for (const key of held) {
        const [kx, ky] = KEYS[key] ?? [0, 0];
        dx += kx;
        dy += ky;
      }
      const magnitude = Math.hypot(dx, dy) || 1;
      dx /= magnitude;
      dy /= magnitude;
      const nextX = Math.min(1, Math.max(0, pos.x + dx * SPEED * dt));
      const nextY = Math.min(1, Math.max(0, pos.y + dy * SPEED * dt * (W / H)));
      // Test each axis separately so the player can slide along walls and map edges.
      if (dx && isWalkable(manifest.walkMap, nextX, pos.y)) pos.x = nextX;
      if (dy && isWalkable(manifest.walkMap, pos.x, nextY)) pos.y = nextY;
      if (dx) pos.facing = dx < 0 ? -1 : 1;

      ctx.clearRect(0, 0, W, H);
      if (street.complete && street.naturalWidth) ctx.drawImage(street, 0, 0, W, H);
      const door = nearDoor();
      if (door) {
        ctx.strokeStyle = "#0071e3";
        ctx.lineWidth = 4;
        ctx.strokeRect(door.x * W, door.y * H, door.w * W, door.h * H);
      }
      if (sprite.complete && sprite.naturalWidth) {
        const source = trim ?? { x: 0, y: 0, w: sprite.naturalWidth, h: sprite.naturalHeight };
        const sh = SPRITE_HEIGHT;
        const sw = source.w / source.h * sh;
        ctx.save();
        ctx.translate(pos.x * W, pos.y * H);
        ctx.scale(pos.facing, 1);
        ctx.drawImage(spriteSource, source.x, source.y, source.w, source.h, -sw / 2, -sh, sw, sh);
        ctx.restore();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      sprite.onload = null;
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clearHeld);
    };
  }, [manifest]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      role="img"
      aria-label={manifest.bible.streetDescription}
      className="aspect-video w-full rounded-2xl bg-neutral-900"
    />
  );
}
