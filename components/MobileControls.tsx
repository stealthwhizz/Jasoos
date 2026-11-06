"use client";

import { useEffect, useState } from "react";
import type { MobileControlsProps } from "@/lib/types/client";

/** Touch controls also appear on narrow windows, including 375px portrait screens. */
export function useCoarsePointer(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const update = () => setEnabled(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return enabled;
}

/** Hold a direction to move; release/cancel/blur or an overlay always clears movement. */
export function MobileControls({ touchInputRef, nearHotspot, paused, onInteract }: MobileControlsProps) {
  const enabled = useCoarsePointer();
  useEffect(() => {
    const clear = () => { touchInputRef.current.x = 0; touchInputRef.current.y = 0; };
    clear();
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => { clear(); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", clear); };
  }, [paused, enabled, touchInputRef]);
  if (!enabled || paused) return null;
  return <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex items-end justify-between px-3 pb-[env(safe-area-inset-bottom)]">
    <div aria-label="Movement controls" className="pointer-events-auto grid grid-cols-3 gap-1 touch-none">
      {[["up", 0, -1, "col-start-2"], ["left", -1, 0, "col-start-1"], ["down", 0, 1, ""], ["right", 1, 0, ""]].map(([name, x, y, position]) =>
        <button key={name} type="button" aria-label={`Move ${name}`} className={`${position} size-11 select-none rounded border-2 border-white/40 bg-black/60 font-bold text-white`}
          onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); touchInputRef.current.x = Number(x); touchInputRef.current.y = Number(y); }}
          onPointerUp={() => { touchInputRef.current.x = 0; touchInputRef.current.y = 0; }}
          onPointerCancel={() => { touchInputRef.current.x = 0; touchInputRef.current.y = 0; }}
          onLostPointerCapture={() => { touchInputRef.current.x = 0; touchInputRef.current.y = 0; }}
        >{{ up: "↑", left: "←", down: "↓", right: "→" }[String(name)]}</button>)}
    </div>
    <button type="button" aria-label={nearHotspot ? `Interact with ${nearHotspot.name}` : "Interact (E)"}
      disabled={!nearHotspot} onClick={() => nearHotspot && onInteract(nearHotspot)}
      className="pointer-events-auto size-14 rounded-full border-2 border-white/40 bg-main font-bold text-main-foreground disabled:opacity-40">E</button>
  </div>;
}
