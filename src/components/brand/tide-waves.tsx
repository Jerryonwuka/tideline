"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The cover's "line waves" artwork as a living background. The SVG is used as a mask so its
 * lines take the theme's wave colour (Foam on Abyss, Tide Blue on Shell) with their original
 * per-line opacity. It drifts slowly, follows the pointer a little and draws in on load.
 */
export function TideWaves({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(step);
    };
    const step = () => {
      x += (targetX - x) * 0.06;
      y += (targetY - y) * 0.06;
      el.style.setProperty("--wave-x", `${(x * 12).toFixed(2)}px`);
      el.style.setProperty("--wave-y", `${(y * 10).toFixed(2)}px`);
      frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.001 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute -inset-[4%] translate-x-(--wave-x) translate-y-(--wave-y) transition-transform duration-700 ease-tide"
        style={{ "--wave-x": "0px", "--wave-y": "0px", opacity: "var(--wave-opacity)" } as React.CSSProperties}
      >
        <div
          className="absolute inset-0 motion-safe:[animation:wave-in_2.4s_var(--ease-expo)_both,tide-drift_24s_var(--ease-hover)_2.4s_infinite_alternate]"
          style={{
            backgroundColor: "var(--wave)",
            maskImage: "url(/brand/line-waves.svg)",
            WebkitMaskImage: "url(/brand/line-waves.svg)",
            maskSize: "100% 100%",
            WebkitMaskSize: "100% 100%",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
          }}
        />
      </div>
      {/* Fade the lines out toward the edges so content stays calm. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,var(--background)_92%)]" />
    </div>
  );
}
