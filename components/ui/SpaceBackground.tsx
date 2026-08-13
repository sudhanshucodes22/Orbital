"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/components/orbital/a11y";
import { createStarfield } from "@/lib/space/starfield";

/** The shared orbital environment for every page that is not the landing page.
 *
 * Same sky, further away. It reuses the landing page's starfield module and
 * its exact atmospheric colours, but sparser, dimmer, slower, and without the
 * Earth — these pages are forms and cards, and the background has to stay
 * behind them rather than compete.
 *
 * Fixed and pointer-events: none, so it never intercepts a click, never
 * scrolls, and never contributes to document height. Content sits above it on
 * z-index 1; the header and menus stay well above that.
 *
 * `glow="center"` adds a soft pool of light behind a centred auth card.
 */
export function SpaceBackground({ glow = "none" }: { glow?: "none" | "center" }) {
  const starRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = starRef.current;
    if (!canvas) return;
    const small = window.innerWidth <= 768;
    return createStarfield(canvas, {
      // Roughly a third of the landing page's density, so it reads as depth
      // rather than as a feature.
      density: small ? 15000 : 9000,
      dprCap: small ? 1.5 : 2,
      // Slower drift: ambient, not animated.
      driftY: 0.05,
      driftX: 0.014,
      intensity: 0.62,
      // The cross flare is a hero-moment detail; behind a form it is noise.
      flare: false,
      animate: !prefersReducedMotion(),
    });
  }, []);

  return (
    <div className="space-bg" aria-hidden="true">
      <canvas ref={starRef} className="space-bg__stars" />
      <div className="space-bg__atmos" />
      {glow === "center" && <div className="space-bg__glow" />}
    </div>
  );
}
