import { cn } from "@/lib/utils";

// Water lines: denser toward the horizon, taller and slower nearer the viewer.
const LINES = 16;
const PERIOD = 800; // one wave, in SVG units; each path spans four so it can loop seamlessly
const WAVES = Array.from({ length: LINES }, (_, i) => {
  const t = i / (LINES - 1);
  const base = 40 + Math.pow(t, 1.7) * 340;
  const amp = 2 + t * 14;
  const phase = i * 1.3;
  const points: string[] = [];
  for (let x = 0; x <= PERIOD * 4; x += 40) {
    const y =
      base + amp * Math.sin((2 * Math.PI * x) / PERIOD + phase) + amp * 0.35 * Math.sin((4 * Math.PI * x) / PERIOD);
    points.push(`${x},${y.toFixed(1)}`);
  }
  return { d: `M${points.join(" L")}`, opacity: 0.45 + t * 0.55, duration: 16 + (1 - t) * 22, reverse: i % 3 === 1 };
});

/**
 * Night-harbour backdrop: a soft glow from above and, optionally, flowing water lines that drift
 * past along the bottom. Pure CSS/SVG; the water stops under reduced motion.
 */
export function Horizon({
  className,
  glow = true,
  water = false,
}: {
  className?: string;
  glow?: boolean;
  water?: boolean;
}) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {glow && (
        <>
          <div className="absolute top-[-30%] left-1/2 h-[80%] w-[110%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,var(--glow-strong),transparent)] blur-2xl" />
          <div className="absolute top-0 left-1/2 h-[60%] w-px -translate-x-1/2 bg-gradient-to-b from-accent/40 to-transparent" />
        </>
      )}
      {water && (
        <svg
          className="absolute inset-x-0 bottom-0 h-[70%] w-full [mask-image:linear-gradient(to_top,black_40%,transparent)]"
          viewBox={`0 0 ${PERIOD * 2} 400`}
          preserveAspectRatio="none"
        >
          {WAVES.map((w, i) => (
            <path
              key={i}
              d={w.d}
              fill="none"
              stroke="var(--blueprint-line)"
              strokeWidth={1}
              strokeOpacity={w.opacity * 0.35}
              vectorEffect="non-scaling-stroke"
              className="motion-safe:animate-[water-flow_var(--d)_linear_infinite]"
              style={
                {
                  "--d": `${w.duration}s`,
                  animationDirection: w.reverse ? "reverse" : "normal",
                } as React.CSSProperties
              }
            />
          ))}
        </svg>
      )}
      {/* Side rails converge toward the centre, framing the content. */}
      <svg className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i} stroke="var(--hairline)" strokeWidth={0.08} vectorEffect="non-scaling-stroke">
            <line x1={0} y1={8 + i * 10} x2={22} y2={56} vectorEffect="non-scaling-stroke" />
            <line x1={100} y1={8 + i * 10} x2={78} y2={56} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>
    </div>
  );
}
