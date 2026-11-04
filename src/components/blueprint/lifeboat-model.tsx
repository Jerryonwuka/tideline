"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Lines, Part, SegmentBuilder, v3 } from "./kit";

/**
 * A covered lifeboat hanging from gravity davits at the ship's side: the safety equipment every
 * departure check protects. Double-ended hull lofted from sections; canopy, davits and falls on top.
 */

const HALF_LEN = 2;
const STATIONS = 28;
const SECTION = 12;

function halfBreadth(x: number) {
  return 0.72 * Math.pow(Math.max(0, 1 - (x / HALF_LEN) ** 2), 0.55) + 0.02;
}

/** Starboard half-section at x: keel (centreline) → gunwale. */
function halfSection(x: number, keel: number, top: number): THREE.Vector3[] {
  const b = halfBreadth(x);
  return Array.from({ length: SECTION + 1 }, (_, i) => {
    const th = -Math.PI / 2 + (i / SECTION) * (Math.PI / 2);
    return v3(x, keel + (top - keel) * (1 + Math.sin(th)), b * Math.cos(th) ** 0.6);
  });
}

function loft(keel: number, top: number, xs: number[]) {
  const rings = xs.map((x) => {
    const half = halfSection(x, keel, top);
    const port = [...half].reverse().map((p) => v3(p.x, p.y, -p.z));
    return [...half, ...port.slice(1)];
  });
  const len = rings[0]!.length;
  const pos: number[] = [];
  rings.forEach((r) => r.forEach((p) => pos.push(p.x, p.y, p.z)));
  const index: number[] = [];
  for (let s = 0; s < rings.length - 1; s++)
    for (let k = 0; k < len - 1; k++) {
      const a = s * len + k;
      index.push(a, a + len, a + 1, a + len, a + len + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  const lines = new SegmentBuilder();
  rings.forEach((r, i) => i % 3 === 0 && lines.polyline(r));
  for (const k of [3, 6, 9, SECTION]) {
    lines.polyline(rings.map((r) => r[k]!));
    lines.polyline(rings.map((r) => r[len - 1 - k]!));
  }
  return { shell: g, lines: lines.build() };
}

export function LifeboatModel() {
  const hull = useMemo(() => {
    const xs = Array.from({ length: STATIONS + 1 }, (_, i) => -HALF_LEN + (2 * HALF_LEN * i) / STATIONS);
    return loft(-0.55, 0.2, xs);
  }, []);
  const canopy = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.62, 0.62, 2.9, 18, 6, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    g.scale(1, 0.75, 1);
    g.translate(0, 0.2, 0);
    return g;
  }, []);
  const rig = useMemo(() => {
    const sb = new SegmentBuilder();
    // Gunwale rubbing strake and canopy windows.
    for (let x = -1.1; x <= 1.1; x += 0.36) {
      for (const side of [1, -1]) sb.circle(v3(x, 0.42, side * 0.52), 0.07, v3(1, 0, 0), v3(0, 1, 0), 10);
    }
    // Falls from davit heads to the hooks.
    for (const x of [-1.35, 1.35]) {
      sb.segment(v3(x, 2.05, 0), v3(x, 0.7, 0));
      sb.circle(v3(x, 0.68, 0), 0.05, v3(1, 0, 0), v3(0, 1, 0), 8);
    }
    // Ship's side and deck edge the davits stand on.
    sb.polyline([v3(-2.6, -1.4, -1.6), v3(2.6, -1.4, -1.6), v3(2.6, 1.0, -1.6), v3(-2.6, 1.0, -1.6)], true);
    sb.polyline([v3(-2.6, 1.0, -1.6), v3(-2.6, 1.0, -2.8), v3(2.6, 1.0, -2.8), v3(2.6, 1.0, -1.6)]);
    for (let x = -2.4; x <= 2.4; x += 0.6) sb.segment(v3(x, -1.4, -1.6), v3(x, 1.0, -1.6));
    // Railing.
    sb.segment(v3(-2.6, 1.45, -1.65), v3(2.6, 1.45, -1.65));
    for (let x = -2.6; x <= 2.6; x += 0.4) sb.segment(v3(x, 1.0, -1.65), v3(x, 1.45, -1.65));
    return sb.build();
  }, []);
  const davit = useMemo(() => {
    // Davit arm profile in the y–z plane, extruded a little along x.
    const s = new THREE.Shape();
    s.moveTo(-2.3, 1.0);
    s.lineTo(-1.9, 1.0);
    s.quadraticCurveTo(-1.5, 1.9, -0.05, 2.0);
    s.lineTo(-0.05, 2.18);
    s.quadraticCurveTo(-1.7, 2.15, -2.3, 1.15);
    s.lineTo(-2.3, 1.0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false, curveSegments: 8 });
    // Shape x → world z, shape y → world y, extrusion → world x.
    g.rotateY(-Math.PI / 2);
    g.translate(0.06, 0, 0);
    return g;
  }, []);

  return (
    <group position={[0, -0.3, 0.6]}>
      <Part geometry={hull.shell} threshold={89} />
      <Lines geometry={hull.lines} />
      <Part geometry={canopy} threshold={20} />
      <Lines geometry={rig} />
      <Part geometry={davit} threshold={30} position={[-1.35, 0, 0]} />
      <Part geometry={davit} threshold={30} position={[1.35, 0, 0]} />
    </group>
  );
}
