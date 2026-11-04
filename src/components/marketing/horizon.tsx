import { cn } from "@/lib/utils";

/**
 * Night-harbour backdrop: a soft glow from above and a perspective water grid that drifts toward
 * the viewer, fading into the horizon. Pure CSS; stops under reduced motion.
 */
export function Horizon({ className, glow = true }: { className?: string; glow?: boolean }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {glow && (
        <>
          <div className="absolute top-[-30%] left-1/2 h-[80%] w-[110%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,var(--glow-strong),transparent)] blur-2xl" />
          <div className="absolute top-0 left-1/2 h-[60%] w-px -translate-x-1/2 bg-gradient-to-b from-accent/40 to-transparent" />
        </>
      )}
      <div className="absolute inset-x-[-50%] bottom-0 h-[55%] [mask-image:linear-gradient(to_top,black_10%,transparent_95%)] [perspective:420px]">
        <div
          className="absolute inset-0 origin-bottom [transform:rotateX(68deg)] motion-safe:animate-[grid-flow_6s_linear_infinite]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--hairline-strong) 1px, transparent 1px), linear-gradient(to bottom, var(--hairline-strong) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>
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
