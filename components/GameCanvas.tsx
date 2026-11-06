"use client";

import { useEffect, useId, useRef } from "react";
import type { PublicManifest } from "@/lib/types";
import { isWalkable } from "@/lib/engine/walkMap";
import { keySprite } from "@/lib/engine/sprite";
import { getGameKey, getMovementVector } from "./gameControls";

const W = 960;
const H = 540;
const SPEED = 0.25; // fraction of the scene per second
const SPRITE_HEIGHT = 96;
const DIRECTIONS = [
  { key: "ArrowUp", label: "Move up", symbol: "↑", placement: "col-start-2 row-start-1" },
  { key: "ArrowLeft", label: "Move left", symbol: "←", placement: "col-start-1 row-start-2" },
  { key: "ArrowRight", label: "Move right", symbol: "→", placement: "col-start-3 row-start-2" },
  { key: "ArrowDown", label: "Move down", symbol: "↓", placement: "col-start-2 row-start-3" },
];

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
  const heldRef = useRef(new Set<string>());
  const pointerKeysRef = useRef(new Map<number, string>());
  const enterRef = useRef<() => void>(() => {});
  const instructionsId = useId();
  const onEnterRef = useRef(onEnter);
  useEffect(() => {
    onEnterRef.current = onEnter;
  }, [onEnter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.focus({ preventScroll: true });
    const url = (kind: string) => manifest.assets.find((a) => a.kind === kind)?.url ?? "";
    const street = loadImage(url("street"));
    const sprite = loadImage(url("sprite"));
    const fallbackSprite = loadImage("/fixtures/sprite.svg");
    let useFallback = false;
    sprite.onerror = () => {
      useFallback = true;
    };
    const pos = { x: 0.5, y: 0.85, facing: 1 }; // feet position, 0..1
    const held = heldRef.current;
    const pointerKeys = pointerKeysRef.current;
    held.clear();
    pointerKeys.clear();
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
          if (!trim) useFallback = true;
          if (trim) {
            context.putImageData(pixels, 0, 0);
            spriteSource = buffer;
          }
        }
      } catch {
        useFallback = true;
      }
    };

    // The door whose bottom edge is closest to the feet, if within reach.
    const nearDoor = () =>
      manifest.doors.find(
        (d) =>
          Math.abs(pos.x - (d.x + d.w / 2)) < Math.max(d.w, 0.045) &&
          Math.abs(pos.y - (d.y + d.h)) < 0.22,
      );

    enterRef.current = () => {
      const door = nearDoor();
      if (door) onEnterRef.current(door.locationId);
    };
    const down = (event: KeyboardEvent) => {
      if (document.activeElement !== canvas || canvas.isContentEditable) return;
      const key = getGameKey(event);
      if (!key) return;
      event.preventDefault();
      if (key !== "e") {
        held.add(key);
      } else if (!event.repeat) {
        enterRef.current();
      }
    };
    const up = (event: KeyboardEvent) =>
      held.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    const clearHeld = () => {
      held.clear();
      pointerKeys.clear();
    };
    canvas.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clearHeld);
    window.addEventListener("focusin", clearHeld);
    document.addEventListener("visibilitychange", clearHeld);

    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const [dx, dy] = getMovementVector([...held, ...pointerKeys.values()]);
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
      const activeSprite = useFallback ? fallbackSprite : sprite;
      if (activeSprite.complete && activeSprite.naturalWidth) {
        const source = (!useFallback && trim) || {
          x: 0,
          y: 0,
          w: activeSprite.naturalWidth,
          h: activeSprite.naturalHeight,
        };
        const sh = SPRITE_HEIGHT;
        const sw = (source.w / source.h) * sh;
        ctx.save();
        ctx.translate(pos.x * W, pos.y * H);
        ctx.scale(pos.facing, 1);
        ctx.drawImage(
          useFallback ? fallbackSprite : spriteSource,
          source.x,
          source.y,
          source.w,
          source.h,
          -sw / 2,
          -sh,
          sw,
          sh,
        );
        ctx.restore();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      sprite.onload = null;
      sprite.onerror = null;
      clearHeld();
      enterRef.current = () => {};
      canvas.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clearHeld);
      window.removeEventListener("focusin", clearHeld);
      document.removeEventListener("visibilitychange", clearHeld);
    };
  }, [manifest]);

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        role="img"
        tabIndex={0}
        onPointerDown={(event) => event.currentTarget.focus()}
        aria-label={manifest.bible.streetDescription}
        aria-describedby={instructionsId}
        className="aspect-video w-full rounded-2xl bg-neutral-900"
      />
      <div className="flex flex-wrap items-center gap-4">
        <div
          role="group"
          aria-label="Movement controls"
          className="grid shrink-0 grid-cols-3 gap-1"
        >
          {DIRECTIONS.map((direction) => (
            <button
              key={direction.key}
              type="button"
              aria-label={direction.label}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                pointerKeysRef.current.set(event.pointerId, direction.key);
              }}
              onPointerUp={(event) => pointerKeysRef.current.delete(event.pointerId)}
              onPointerCancel={(event) => pointerKeysRef.current.delete(event.pointerId)}
              onLostPointerCapture={(event) => pointerKeysRef.current.delete(event.pointerId)}
              onKeyDown={(event) => {
                if (
                  (event.key === " " || event.key === "Enter") &&
                  !event.altKey &&
                  !event.ctrlKey &&
                  !event.metaKey
                ) {
                  event.preventDefault();
                  heldRef.current.add(direction.key);
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  heldRef.current.delete(direction.key);
                }
              }}
              onBlur={() => heldRef.current.clear()}
              className={`${direction.placement} h-12 w-14 touch-none select-none rounded-xl border border-neutral-300 bg-white text-xl hover:bg-neutral-100 active:bg-blue-100`}
            >
              {direction.symbol}
            </button>
          ))}
          <button
            type="button"
            aria-label="Enter nearest door"
            onClick={() => enterRef.current()}
            className="col-start-2 row-start-2 h-12 w-14 rounded-xl bg-accent text-sm font-medium text-white"
          >
            Enter
          </button>
        </div>
        <p id={instructionsId} className="max-w-md text-sm text-neutral-600">
          Focus or tap the street. Arrow keys or WASD move; E enters a lit door. You can also hold
          the direction buttons to move and use Enter at a door.
        </p>
      </div>
    </div>
  );
}
