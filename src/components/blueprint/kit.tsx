"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";

/**
 * Blueprint rendering kit: every part is a faint fill that hides what's behind it, crisp lines on
 * top, and a ghost pass so hidden lines still show through faintly, like a technical drawing.
 */

interface Palette {
  line: THREE.Color;
  fill: THREE.Color;
}

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const line = style.getPropertyValue("--blueprint-line").trim() || "#2457d6";
  const fill = style.getPropertyValue("--background").trim() || "#ffffff";
  return { line: new THREE.Color(line), fill: new THREE.Color(fill) };
}

/** Re-reads the theme colours whenever the html class (light/dark) changes. */
export function useBlueprintPalette(): Palette | null {
  const [palette, setPalette] = useState<Palette | null>(null);
  useEffect(() => {
    setPalette(readPalette());
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, []);
  return palette;
}

interface Materials {
  fill: THREE.MeshBasicMaterial;
  line: THREE.LineBasicMaterial;
  ghost: THREE.LineBasicMaterial;
  faint: THREE.LineBasicMaterial;
  accent: THREE.MeshBasicMaterial;
}

const MaterialsContext = createContext<Materials | null>(null);

export function BlueprintMaterials({ palette, children }: { palette: Palette; children: ReactNode }) {
  const materials = useMemo<Materials>(
    () => ({
      fill: new THREE.MeshBasicMaterial({
        color: palette.fill,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      line: new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.95 }),
      ghost: new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.1, depthTest: false }),
      faint: new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.35 }),
      accent: new THREE.MeshBasicMaterial({
        color: palette.line,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      }),
    }),
    [palette],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  return <MaterialsContext.Provider value={materials}>{children}</MaterialsContext.Provider>;
}

export function useMaterials(): Materials {
  const m = useContext(MaterialsContext);
  if (!m) throw new Error("useMaterials outside BlueprintMaterials");
  return m;
}

/** A solid part: fill + outline edges (+ ghost edges). */
export function Part({
  geometry,
  threshold = 24,
  position,
  rotation,
  scale,
  fill = true,
  accent = false,
}: {
  geometry: THREE.BufferGeometry;
  threshold?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  fill?: boolean;
  accent?: boolean;
}) {
  const m = useMaterials();
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, threshold), [geometry, threshold]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {fill && <mesh geometry={geometry} material={accent ? m.accent : m.fill} renderOrder={0} />}
      <lineSegments geometry={edges} material={m.line} renderOrder={1} />
      <lineSegments geometry={edges} material={m.ghost} renderOrder={2} />
    </group>
  );
}

/** Loose lines (frames, rails, rigging) as segment pairs. */
export function Lines({
  geometry,
  faint = false,
  ghost = true,
}: {
  geometry: THREE.BufferGeometry;
  faint?: boolean;
  ghost?: boolean;
}) {
  const m = useMaterials();
  return (
    <>
      <lineSegments geometry={geometry} material={faint ? m.faint : m.line} renderOrder={1} />
      {ghost && <lineSegments geometry={geometry} material={m.ghost} renderOrder={2} />}
    </>
  );
}

/** Collects polylines/circles and turns them into one segment geometry. */
export class SegmentBuilder {
  private readonly pts: number[] = [];

  segment(a: THREE.Vector3Like, b: THREE.Vector3Like): this {
    this.pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    return this;
  }

  polyline(points: THREE.Vector3Like[], closed = false): this {
    for (let i = 0; i < points.length - 1; i++) this.segment(points[i]!, points[i + 1]!);
    if (closed && points.length > 2) this.segment(points[points.length - 1]!, points[0]!);
    return this;
  }

  /** Circle in the plane spanned by unit vectors u and v around centre c. */
  circle(c: THREE.Vector3, r: number, u: THREE.Vector3, v: THREE.Vector3, steps = 12): this {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push(
        c
          .clone()
          .addScaledVector(u, Math.cos(a) * r)
          .addScaledVector(v, Math.sin(a) * r),
      );
    }
    return this.polyline(pts, true);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pts, 3));
    return g;
  }
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
