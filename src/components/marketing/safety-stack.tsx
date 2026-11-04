import { getTranslations } from "next-intl/server";

// Isometric layer geometry (viewBox 420 × 300).
const CX = 270;
const HALF_W = 128;
const HALF_H = 64;
const THICK = 8;
const GAP = 26;
const TOP_Y = 34;
const GRID = 6;

type Pt = [number, number];

function face(y: number): { a: Pt; b: Pt; c: Pt; d: Pt } {
  return {
    a: [CX, y],
    b: [CX + HALF_W, y + HALF_H],
    c: [CX, y + HALF_H * 2],
    d: [CX - HALF_W, y + HALF_H],
  };
}

const pts = (...p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(" ");
const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/**
 * The four safety checks drawn as stacked layers under the trip. On reveal the layers settle into
 * place one by one; the trip's tile on the top layer pulses once everything has passed.
 */
export async function SafetyStack() {
  const t = await getTranslations("home.platform.safety.demo");
  const layers = t.raw("layers") as string[];
  const top = face(TOP_Y);
  // Highlighted cell on the top grid.
  const u0 = 2 / GRID;
  const u1 = 3 / GRID;
  const v0 = 2 / GRID;
  const v1 = 3 / GRID;
  const at = (u: number, v: number): Pt => [
    top.a[0] + (top.b[0] - top.a[0]) * u + (top.d[0] - top.a[0]) * v,
    top.a[1] + (top.b[1] - top.a[1]) * u + (top.d[1] - top.a[1]) * v,
  ];
  const cell = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)] as const;
  const cellCenter = at((u0 + u1) / 2, (v0 + v1) / 2);

  return (
    <svg viewBox="0 0 420 300" className="w-full" role="img" aria-label={t("aria")}>
      {/* Layers, bottom first so the upper ones cover them. */}
      {[...layers.keys()].reverse().map((i) => {
        const y = TOP_Y + (i + 1) * GAP;
        const f = face(y);
        const labelY = f.d[1] + THICK / 2;
        return (
          <g
            key={i}
            className="transition-[transform,opacity] duration-[1400ms] ease-expo in-data-[visible=false]:translate-y-8 in-data-[visible=false]:opacity-0"
            style={{ transitionDelay: `${(layers.length - i) * 120}ms` }}
          >
            <polygon
              points={pts(f.d, f.c, [f.c[0], f.c[1] + THICK], [f.d[0], f.d[1] + THICK])}
              fill="var(--surface-raised)"
              stroke="var(--hairline-strong)"
            />
            <polygon
              points={pts(f.c, f.b, [f.b[0], f.b[1] + THICK], [f.c[0], f.c[1] + THICK])}
              fill="var(--surface)"
              stroke="var(--hairline-strong)"
            />
            <polygon points={pts(f.a, f.b, f.c, f.d)} fill="var(--background)" stroke="var(--hairline-strong)" />
            <line x1={100} y1={labelY} x2={f.d[0]} y2={labelY} stroke="var(--hairline-strong)" />
            <circle cx={f.d[0]} cy={labelY} r={1.5} fill="var(--text-meta)" />
            <text x={14} y={labelY + 3.5} className="fill-meta font-mono text-[10px] tracking-[0.08em]">
              {layers[i]}
            </text>
          </g>
        );
      })}

      {/* Top layer: the trip, with a grid and the highlighted tile. */}
      <g className="transition-[transform,opacity] duration-[1400ms] ease-expo in-data-[visible=false]:-translate-y-6 in-data-[visible=false]:opacity-0">
        <polygon
          points={pts(top.d, top.c, [top.c[0], top.c[1] + THICK], [top.d[0], top.d[1] + THICK])}
          fill="var(--surface-raised)"
          stroke="var(--hairline-strong)"
        />
        <polygon
          points={pts(top.c, top.b, [top.b[0], top.b[1] + THICK], [top.c[0], top.c[1] + THICK])}
          fill="var(--surface)"
          stroke="var(--hairline-strong)"
        />
        <polygon
          points={pts(top.a, top.b, top.c, top.d)}
          fill="var(--surface-raised)"
          stroke="var(--foreground)"
          strokeOpacity={0.35}
        />
        {Array.from({ length: GRID - 1 }, (_, k) => {
          const s = (k + 1) / GRID;
          const p1 = lerp(top.a, top.b, s);
          const p2 = lerp(top.d, top.c, s);
          const q1 = lerp(top.a, top.d, s);
          const q2 = lerp(top.b, top.c, s);
          return (
            <g key={k} stroke="var(--foreground)" strokeOpacity={0.18}>
              <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} />
              <line x1={q1[0]} y1={q1[1]} x2={q2[0]} y2={q2[1]} />
            </g>
          );
        })}
        <polygon
          points={pts(...cell)}
          fill="var(--accent)"
          className="motion-safe:animate-[tile-glow_3s_var(--ease-hover)_1.6s_infinite]"
        />
        <line
          x1={cellCenter[0]}
          y1={cellCenter[1]}
          x2={cellCenter[0]}
          y2={14}
          stroke="var(--foreground)"
          strokeOpacity={0.6}
        />
        <circle cx={cellCenter[0]} cy={cellCenter[1]} r={2} fill="var(--foreground)" />
        <line x1={cellCenter[0]} y1={14} x2={100} y2={14} stroke="var(--foreground)" strokeOpacity={0.6} />
        <text x={14} y={17.5} className="fill-foreground font-mono text-[10px] tracking-[0.08em]">
          {t("top")}
        </text>
      </g>
    </svg>
  );
}
