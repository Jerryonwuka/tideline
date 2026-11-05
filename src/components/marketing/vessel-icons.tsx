import { cn } from "@/lib/utils";

/**
 * Side-profile line drawings of the vessel types Tideline supports. 80 × 40 viewBox, waterline at y = 31.
 * Every stroke has pathLength="1" so it can draw itself in (see [data-draw] in globals.css).
 */
export type VesselType =
  "ferry" | "water_taxi" | "speedboat" | "crew_boat" | "osv" | "fsv" | "tug" | "barge" | "landing_craft" | "pilot_boat";

const PATHS: Record<VesselType, string[]> = {
  ferry: [
    "M6 25 H74 L69 31 H11 Z",
    "M12 25 V17 H66 V25",
    "M20 17 V11 H56 V17",
    "M16 21 H62",
    "M26 14 H50",
    "M60 11 V7",
  ],
  water_taxi: ["M8 25 H70 Q69 29 62 31 H16 Q10 30 8 25 Z", "M22 25 V18 H54 V25", "M19 18 H57", "M26 21.5 H50"],
  speedboat: ["M6 24 H70 L63 30 H18 Q10 29 6 24 Z", "M36 24 L44 17 H52 V24", "M14 24 V21 H30", "M58 24 V22"],
  crew_boat: [
    "M5 25 H75 L70 31 H9 Z",
    "M38 25 V14 H62 V25",
    "M42 18 H58",
    "M52 14 V7",
    "M48 9 H56",
    "M10 25 V21 H32 V25",
    "M17 21 V25 M24 21 V25",
  ],
  osv: [
    "M3 25 H77 L74 31 H7 Z",
    "M54 25 V9 H72 V25",
    "M56 13 H70",
    "M56 17.5 H70",
    "M64 9 V4",
    "M8 25 V21 H50",
    "M20 21 V14 L32 21",
  ],
  fsv: [
    "M4 25 H76 L72 31 H8 Z",
    "M44 25 V13 H66 L70 19 V25",
    "M48 17 H64",
    "M58 13 V6",
    "M9 25 V20 H38 V25",
    "M18 20 V25 M28 20 V25",
  ],
  tug: [
    "M14 25 H66 Q68 31 60 31 H20 Q12 31 14 25 Z",
    "M30 25 V15 H48 V25",
    "M33 19 H45",
    "M37 15 V8 H42 V15",
    "M66 25 Q71 25 71 28",
    "M18 25 V22 H26",
  ],
  barge: ["M4 21 H76 V30 H4 Z", "M10 21 V13 H26 V21", "M28 21 V13 H44 V21", "M46 21 V15 H60 V21", "M62 21 V17 H72 V21"],
  landing_craft: ["M6 25 H62 L74 19 V25 L70 31 H10 Z", "M10 25 V15 H24 V25", "M13 19 H21", "M28 25 V21 H60"],
  pilot_boat: ["M6 25 H74 L68 31 H12 Z", "M30 25 V14 H52 V25", "M34 18 H48", "M41 14 V7", "M37 9 H45", "M12 22 H24"],
};

export function VesselIcon({ type, className }: { type: VesselType; className?: string }) {
  return (
    <svg
      viewBox="0 0 80 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-10 w-20", className)}
    >
      {PATHS[type].map((d) => (
        <path key={d} d={d} pathLength={1} />
      ))}
      {/* Waterline */}
      <path d="M2 34 Q12 32 22 34 T42 34 T62 34 T78 34" strokeOpacity={0.35} pathLength={1} />
    </svg>
  );
}

export const VESSEL_TYPES: VesselType[] = [
  "ferry",
  "water_taxi",
  "speedboat",
  "crew_boat",
  "osv",
  "fsv",
  "tug",
  "barge",
  "landing_craft",
  "pilot_boat",
];
