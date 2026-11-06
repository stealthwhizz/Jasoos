"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/** Gameplay stills for the login marketing panel (right pane / mobile band). */
const SLIDES = [
  { src: "/login/lagaan-2.webp", alt: "Lagaan" },
  { src: "/login/lagaan-1.webp", alt: "Lagaan" },
  { src: "/login/znmd.webp", alt: "Zindagi Na Milegi Dobara" },
  { src: "/login/green-room.webp", alt: "The Actress's Green Room" },
  { src: "/login/gangs-of-wasseypur.webp", alt: "Gangs of Wasseypur" },
] as const;

const INTERVAL_MS = 4000;
const CROSSFADE_S = 0.5;

/**
 * Slow crossfade carousel of gameplay stills with a subtle Ken Burns zoom.
 * Respects `prefers-reduced-motion` — shows the first slide only.
 *
 * Stills are pre-compressed WebP (converted once from the original PNGs), so they are served
 * as-is (`unoptimized`) without a second pass by the Vercel image optimizer.
 */
export function LoginShowcase({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index]!;

  useEffect(() => {
    for (const { src } of SLIDES) {
      const img = new window.Image();
      img.src = src;
    }
  }, []);

  useEffect(() => {
    if (reduceMotion || SLIDES.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <div
      className={`relative overflow-hidden bg-ink ${className ?? ""}`}
      aria-hidden
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={slide.src}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduceMotion ? 0 : CROSSFADE_S,
            ease: "easeInOut",
          }}
          className="absolute inset-0"
        >
          <Image
            src={slide.src}
            alt={slide.alt}
            fill
            priority={index === 0}
            unoptimized
            sizes="(max-width: 1024px) 100vw, 60vw"
            className={
              reduceMotion
                ? "object-cover object-center"
                : "animate-kenburns-subtle object-cover object-center"
            }
          />
        </motion.div>
      </AnimatePresence>

      {/* Warm edge fade into the form column */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-paper/80 to-transparent lg:w-24" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink/25 to-transparent" />
    </div>
  );
}
