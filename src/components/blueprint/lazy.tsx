"use client";

import dynamic from "next/dynamic";

/** Placeholder while the 3D code loads: an empty drafting frame, so layout doesn't jump. */
function Loading() {
  return (
    <div className="flex size-full items-center justify-center">
      <span className="size-1.5 animate-ping rounded-pill bg-accent" />
    </div>
  );
}

// three.js only ever loads in the browser, after the page is interactive.
export const ShipHero = dynamic(() => import("./ship-hero"), { ssr: false, loading: Loading });
export const SafetyScene = dynamic(() => import("./section-scenes").then((m) => m.SafetyScene), {
  ssr: false,
  loading: Loading,
});
export const ConnectScene = dynamic(() => import("./section-scenes").then((m) => m.ConnectScene), {
  ssr: false,
  loading: Loading,
});
