"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Lines, Part, SegmentBuilder, v3 } from "./kit";

/*
 * A passenger vessel built entirely in code, in metres-ish units: length ~22, bow toward +x,
 * waterline at y = 0. The hull is lofted from cross-sections so its frames can be drawn like
 * a shipwright's lines plan.
 */

const STERN = -10;
const BOW = 10.6;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Half-breadth of the hull at station x. */
function breadth(x: number): number {
  if (x <= 3) return 1.4 - 0.16 * clamp01((-x - 6) / 4);
  return Math.max(0.03, 1.4 * Math.sqrt(Math.max(0, 1 - ((x - 3) / (BOW - 3)) ** 2)));
}
/** Height of the main deck (sheer rises toward the bow). */
function deckY(x: number): number {
  return 1.3 + 0.38 * clamp01((x - 4) / (BOW - 4)) ** 2;
}
/** Height of the keel (rises at the stem and a little at the stern). */
function keelY(x: number): number {
  if (x > 6) return -1.5 + clamp01((x - 6) / (BOW - 6)) ** 2.4 * 2.7;
  if (x < -8) return -1.5 + ((-8 - x) / 2) * 0.55;
  return -1.5;
}

const SECTION_BILGE = 10;
const SECTION_SIDE = 6;
const STATIONS = 84;

/** Starboard half-section at station x, keel → deck edge. */
function halfSection(x: number): THREE.Vector3[] {
  const b = breadth(x);
  const yk = keelY(x);
  const yd = deckY(x);
  const yb = yk + Math.min(1.0, (yd - yk) * 0.45);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= SECTION_BILGE; i++) {
    const th = -Math.PI / 2 + (i / SECTION_BILGE) * (Math.PI / 2);
    const z = b * Math.pow(Math.cos(th), 0.45);
    pts.push(v3(x, yb + (yb - yk) * Math.sin(th), z));
  }
  for (let i = 1; i <= SECTION_SIDE; i++) {
    const y = yb + ((yd - yb) * i) / SECTION_SIDE;
    pts.push(v3(x, y, b * (1 + 0.03 * (y - yb))));
  }
  return pts;
}

/** Full section loop: starboard keel → deck, then port deck → keel. */
function fullSection(x: number): THREE.Vector3[] {
  const half = halfSection(x);
  const port = [...half].reverse().map((p) => v3(p.x, p.y, -p.z));
  return [...half, ...port.slice(1)];
}

function buildHull() {
  const stations = Array.from({ length: STATIONS + 1 }, (_, i) => STERN + ((BOW - STERN) * i) / STATIONS);
  const rings = stations.map(fullSection);
  const ringLen = rings[0]!.length;
  const positions: number[] = [];
  rings.forEach((ring) => ring.forEach((p) => positions.push(p.x, p.y, p.z)));
  const index: number[] = [];
  for (let s = 0; s < STATIONS; s++) {
    for (let k = 0; k < ringLen - 1; k++) {
      const a = s * ringLen + k;
      const b = a + ringLen;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // Transom: a fan across the stern section.
  const sternRing = rings[0]!;
  const centre = positions.length / 3;
  const c = sternRing.reduce((acc, p) => acc.add(p), v3(0, 0, 0)).multiplyScalar(1 / ringLen);
  positions.push(c.x, c.y, c.z);
  for (let k = 0; k < ringLen - 1; k++) index.push(centre, k, k + 1);

  const shell = new THREE.BufferGeometry();
  shell.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  shell.setIndex(index);

  // Lines plan: frames (sections) every few stations, plus longitudinals.
  const lines = new SegmentBuilder();
  rings.forEach((ring, s) => {
    if (s % 4 === 0 || s === STATIONS) lines.polyline(ring);
  });
  for (const k of [3, 6, 9, SECTION_BILGE + 2, SECTION_BILGE + 4]) {
    lines.polyline(rings.map((r) => r[k]!));
    lines.polyline(rings.map((r) => r[ringLen - 1 - k]!));
  }
  const deckEdge = SECTION_BILGE + SECTION_SIDE;
  lines.polyline(rings.map((r) => r[deckEdge]!));
  lines.polyline(rings.map((r) => r[ringLen - 1 - deckEdge]!));
  lines.polyline(sternRing);

  // Portholes on both sides, with gaps where the lifeboats hang.
  const holes = new SegmentBuilder();
  for (const y of [0.45, 0.85]) {
    for (let x = -8.6; x <= 6.2; x += 0.42) {
      const b = breadth(x);
      for (const side of [1, -1]) {
        holes.circle(v3(x, y, side * (b * 1.012 + 0.01)), 0.075, v3(1, 0, 0), v3(0, 1, 0), 10);
      }
    }
  }
  // Waterline (boot top).
  const water = new SegmentBuilder();
  for (const side of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    for (let x = STERN; x <= 9.4; x += 0.25) pts.push(v3(x, 0, side * breadth(x) * 0.985));
    water.polyline(pts);
  }

  return { shell, lines: lines.build(), holes: holes.build(), water: water.build() };
}

// --- Superstructure -------------------------------------------------------------------------

const DECK_H = 0.34;
const DECKS = 6;
const BASE = 1.3;
const TOP = BASE + DECKS * DECK_H;

function deckPlan(k: number) {
  return { aft: -9.2 + k * 0.38, fwd: 5.6 - k * 0.5 - (k > 3 ? 0.5 : 0), half: 1.32 - k * 0.07 };
}

function deckGeometry(k: number): THREE.BufferGeometry {
  const { aft, fwd, half } = deckPlan(k);
  const shape = new THREE.Shape();
  shape.moveTo(aft, -half);
  shape.lineTo(fwd - half * 0.9, -half);
  shape.quadraticCurveTo(fwd, -half, fwd, 0);
  shape.quadraticCurveTo(fwd, half, fwd - half * 0.9, half);
  shape.lineTo(aft, half);
  shape.lineTo(aft, -half);
  const g = new THREE.ExtrudeGeometry(shape, { depth: DECK_H, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, BASE + k * DECK_H, 0);
  return g;
}

function windowBands(): THREE.BufferGeometry {
  const sb = new SegmentBuilder();
  for (let k = 1; k < DECKS - 1; k++) {
    const { aft, fwd, half } = deckPlan(k);
    const y0 = BASE + k * DECK_H;
    const straightEnd = fwd - half * 0.9;
    for (const side of [1, -1]) {
      const z = side * (half + 0.004);
      sb.segment(v3(aft + 0.2, y0 + 0.1, z), v3(straightEnd, y0 + 0.1, z));
      sb.segment(v3(aft + 0.2, y0 + 0.25, z), v3(straightEnd, y0 + 0.25, z));
      for (let x = aft + 0.2; x <= straightEnd; x += k % 2 ? 0.28 : 0.4) {
        sb.segment(v3(x, y0 + 0.1, z), v3(x, y0 + 0.25, z));
      }
    }
    // Wrap-around windows on the front curve of the upper decks (the bridge).
    if (k >= 3) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = -Math.PI / 2 + (i / 16) * Math.PI;
        pts.push(v3(straightEnd + Math.cos(a) * half * 0.9 + 0.01, y0 + 0.2, Math.sin(a) * (half + 0.004)));
      }
      sb.polyline(pts);
    }
  }
  // Rail around the top deck.
  const top = deckPlan(DECKS - 1);
  const yr = TOP + 0.14;
  sb.polyline(
    [
      v3(top.aft, yr, -top.half),
      v3(top.fwd - top.half, yr, -top.half),
      v3(top.fwd, yr, 0),
      v3(top.fwd - top.half, yr, top.half),
      v3(top.aft, yr, top.half),
    ],
    true,
  );
  for (let x = top.aft; x <= top.fwd - top.half; x += 0.35) {
    sb.segment(v3(x, TOP, top.half), v3(x, yr, top.half));
    sb.segment(v3(x, TOP, -top.half), v3(x, yr, -top.half));
  }
  return sb.build();
}

function lifeboats() {
  const boat = new THREE.CapsuleGeometry(0.13, 0.55, 4, 10);
  boat.rotateZ(Math.PI / 2);
  const davits = new SegmentBuilder();
  const positions: [number, number, number][] = [];
  const half = deckPlan(0).half;
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const x = -4.4 + i * 1.6;
      const z = side * (half + 0.2);
      positions.push([x, BASE + 0.24, z]);
      for (const dx of [-0.32, 0.32]) {
        davits.polyline([
          v3(x + dx, BASE + DECK_H, side * (half - 0.02)),
          v3(x + dx, BASE + 0.62, side * (half + 0.08)),
          v3(x + dx, BASE + 0.6, z),
        ]);
        davits.segment(v3(x + dx, BASE + 0.6, z), v3(x + dx, BASE + 0.36, z));
      }
    }
  }
  return { boat, positions, davits: davits.build() };
}

function funnel(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-6.5, TOP);
  s.lineTo(-4.5, TOP);
  s.quadraticCurveTo(-4.6, TOP + 0.8, -5.2, TOP + 1.15);
  s.lineTo(-6.1, TOP + 1.2);
  s.quadraticCurveTo(-6.6, TOP + 0.7, -6.5, TOP);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -0.45);
  return g;
}

/** Vertical offset applied to the whole model so it sits centred in the frame. */
export const SHIP_OFFSET_Y = -0.9;

export function ShipModel() {
  const hull = useMemo(buildHull, []);
  const decks = useMemo(() => Array.from({ length: DECKS }, (_, k) => deckGeometry(k)), []);
  const bands = useMemo(windowBands, []);
  const boats = useMemo(lifeboats, []);
  const funnelGeo = useMemo(funnel, []);
  const parts = useMemo(
    () => ({
      bulb: new THREE.SphereGeometry(1, 14, 8),
      pipe: new THREE.CylinderGeometry(0.09, 0.09, 0.55, 10),
      dome: new THREE.SphereGeometry(0.22, 12, 8),
      stalk: new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6),
      mast: new THREE.CylinderGeometry(0.035, 0.05, 1.5, 6),
      yard: new THREE.BoxGeometry(0.06, 0.04, 0.9),
      wing: new THREE.BoxGeometry(0.55, 0.16, 3.4),
      scanner: new THREE.BoxGeometry(0.06, 0.05, 0.7),
    }),
    [],
  );

  return (
    <group position={[0, SHIP_OFFSET_Y, 0]}>
      <Part geometry={hull.shell} threshold={89} />
      <Lines geometry={hull.lines} />
      <Lines geometry={hull.holes} ghost={false} />
      <Lines geometry={hull.water} faint ghost={false} />
      {/* Bulbous bow */}
      <Part geometry={parts.bulb} threshold={1} position={[9.3, -0.95, 0]} scale={[1.3, 0.42, 0.42]} />

      {decks.map((g, k) => (
        <Part key={k} geometry={g} threshold={30} />
      ))}
      <Lines geometry={bands} />

      {boats.positions.map((p, i) => (
        <Part key={i} geometry={boats.boat} threshold={30} position={p} />
      ))}
      <Lines geometry={boats.davits} />

      {/* Bridge wings */}
      <Part geometry={parts.wing} position={[deckPlan(4).fwd - 1.1, BASE + 4 * DECK_H + 0.2, 0]} />

      {/* Funnel and exhausts */}
      <Part geometry={funnelGeo} threshold={30} />
      <Part geometry={parts.pipe} position={[-5.75, TOP + 1.35, 0.17]} rotation={[0, 0, 0.25]} />
      <Part geometry={parts.pipe} position={[-5.75, TOP + 1.35, -0.17]} rotation={[0, 0, 0.25]} />

      {/* Radar domes and mast */}
      {[-2.6, -1.7].map((x) => (
        <group key={x}>
          <Part geometry={parts.stalk} position={[x, TOP + 0.25, 0]} />
          <Part geometry={parts.dome} threshold={1} position={[x, TOP + 0.62, 0]} />
        </group>
      ))}
      <Part geometry={parts.mast} position={[1.4, TOP + 0.75, 0]} />
      <Part geometry={parts.yard} position={[1.4, TOP + 1.2, 0]} />
      <Part geometry={parts.scanner} position={[1.4, TOP + 1.45, 0]} />
    </group>
  );
}

/** Hotspot anchors in world space (offset included), with the outward direction each faces. */
export const SHIP_ANCHORS = {
  bridge: { position: [deckPlan(4).fwd + 0.05, BASE + 4.5 * DECK_H + SHIP_OFFSET_Y, 0], normal: [1, 0.25, 0] },
  lifeboats: { position: [-1.2, BASE + 0.3 + SHIP_OFFSET_Y, deckPlan(0).half + 0.4], normal: [0, 0.2, 1] },
  hull: { position: [4.2, 0.3 + SHIP_OFFSET_Y, breadth(4.2) + 0.05], normal: [0, 0, 1] },
  engine: { position: [-5.5, TOP + 1.25 + SHIP_OFFSET_Y, 0.5], normal: [0, 0.4, 1] },
} as const satisfies Record<
  string,
  { position: readonly [number, number, number]; normal: readonly [number, number, number] }
>;
