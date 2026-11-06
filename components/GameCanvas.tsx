"use client";

import { useEffect, useRef } from "react";
import type { PublicManifest } from "@/lib/types";

const W = 960;
const H = 540;
const SPEED = 0.25; // fraction of the scene per second
const SPRITE_SCALE = 2;
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
    const { cols, rows, cells } = manifest.walkMap;
    const hasWalkMap =
      Number.isInteger(cols) &&
      cols > 0 &&
      Number.isInteger(rows) &&
      rows > 0 &&
      cells.length === cols * rows;

    const isWalkable = (x: number, y: number) => {
      if (!hasWalkMap) return true;
      const col = Math.min(cols - 1, Math.max(0, Math.floor(x * cols)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(y * rows)));
      return cells[row * cols + col] === true;
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
      if (dx && isWalkable(nextX, pos.y)) pos.x = nextX;
      if (dy && isWalkable(pos.x, nextY)) pos.y = nextY;
      if (dx) pos.facing = dx < 0 ? -1 : 1;

      ctx.clearRect(0, 0, W, H);
      if (street.complete) ctx.drawImage(street, 0, 0, W, H);
      const door = nearDoor();
      if (door) {
        ctx.strokeStyle = "#0071e3";
        ctx.lineWidth = 4;
        ctx.strokeRect(door.x * W, door.y * H, door.w * W, door.h * H);
      }
      if (sprite.complete && sprite.naturalWidth) {
        const sw = sprite.naturalWidth * SPRITE_SCALE;
        const sh = sprite.naturalHeight * SPRITE_SCALE;
        ctx.save();
        ctx.translate(pos.x * W, pos.y * H);
        ctx.scale(pos.facing, 1);
        ctx.drawImage(sprite, -sw / 2, -sh, sw, sh);
        ctx.restore();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
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
