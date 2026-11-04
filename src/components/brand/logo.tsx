import { cn } from "@/lib/utils";

// Proportions from the Figma lockup: globe 109.609 × 110, gap 28.6, wordmark 295.828 × 59.4.
const GLOBE_RATIO = 109.609 / 110;
const GAP_RATIO = 28.6 / 110;
const WORDMARK_HEIGHT_RATIO = 59.4 / 110;
const WORDMARK_RATIO = 295.828 / 59.4;

interface LogoProps {
  /** Height of the globe in px; the wordmark scales with it. */
  size?: number;
  /** "lockup" = globe + wordmark, "icon" = globe only. */
  variant?: "lockup" | "icon";
  /** "foam" uses the Foam globe on dark backgrounds for hero moments. */
  accent?: "mono" | "foam";
  className?: string;
  /** Accessible name; the wordmark already reads "Tideline". */
  label?: string;
}

/**
 * Tideline logo. Off-white on Abyss in dark mode, Ink on Shell in light mode (Figma 01 — Logo).
 * Artwork is used as supplied; never recoloured, stretched or given effects.
 */
export function Logo({ size = 24, variant = "lockup", accent = "mono", className, label = "Tideline" }: LogoProps) {
  const globeW = Math.round(size * GLOBE_RATIO * 100) / 100;
  const wordH = Math.round(size * WORDMARK_HEIGHT_RATIO * 100) / 100;
  const wordW = Math.round(wordH * WORDMARK_RATIO * 100) / 100;
  const darkGlobe = accent === "foam" ? "/brand/globe-foam.svg" : "/brand/globe-shell.svg";
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center", className)}
      style={{ gap: variant === "lockup" ? size * GAP_RATIO : undefined }}
    >
      {/* eslint-disable @next/next/no-img-element -- static SVG brand artwork */}
      <img src="/brand/globe-ink.svg" alt="" width={globeW} height={size} className="dark:hidden" />
      <img src={darkGlobe} alt="" width={globeW} height={size} className="hidden dark:block" />
      {variant === "lockup" && (
        <>
          <img src="/brand/wordmark-ink.svg" alt="" width={wordW} height={wordH} className="dark:hidden" />
          <img src="/brand/wordmark-shell.svg" alt="" width={wordW} height={wordH} className="hidden dark:block" />
        </>
      )}
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}
