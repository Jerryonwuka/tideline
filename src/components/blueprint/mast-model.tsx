"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Lines, Part, SegmentBuilder, useMaterials, v3 } from "./kit";

/**
 * A ship's communications mast: radar scanner turning on the yard, GPS and satellite domes,
 * whip antennas sending out signal rings. Each device is labelled with what it powers.
 */

export interface MastLabels {
  radar: string;
  gps: string;
  satcom: string;
  vhf: string;
  cell: string;
}

function SignalRings({ origin, delay }: { origin: [number, number, number]; delay: number }) {
  const m = useMaterials();
  const rings = useRef<THREE.LineLoop[]>([]);
  const geometry = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(v3(Math.cos(a), 0, Math.sin(a)));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  const materials = useMemo(() => [0, 1, 2].map(() => m.line.clone()), [m.line]);

  useFrame(({ clock }) => {
    rings.current.forEach((ring, i) => {
      const t = ((clock.elapsedTime + delay + i * 0.9) % 2.7) / 2.7;
      ring.scale.setScalar(0.15 + t * 1.6);
      (ring.material as THREE.LineBasicMaterial).opacity = (1 - t) * 0.8;
    });
  });

  return (
    <group position={origin}>
      {materials.map((mat, i) => (
        <lineLoop
          key={i}
          ref={(el) => {
            if (el) rings.current[i] = el;
          }}
          geometry={geometry}
          material={mat}
        />
      ))}
    </group>
  );
}

function Tag({ position, children }: { position: [number, number, number]; children: string }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]}>
      <span className="rounded-xs border border-hairline-strong bg-background/85 px-2 py-1 label-mono-sm whitespace-nowrap text-foreground backdrop-blur">
        {children}
      </span>
    </Html>
  );
}

export function MastModel({ labels }: { labels: MastLabels }) {
  const scanner = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (scanner.current) scanner.current.rotation.y += dt * 1.4;
  });

  const geo = useMemo(() => {
    const lattice = new SegmentBuilder();
    // Tapered tripod lattice: three legs with cross-bracing.
    const legs = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2 + Math.PI / 6);
    const at = (a: number, y: number) => {
      const r = 0.55 - (y + 2) * 0.09;
      return v3(Math.cos(a) * r, y, Math.sin(a) * r);
    };
    for (const a of legs) lattice.segment(at(a, -2), at(a, 1.6));
    for (let y = -2; y < 1.6; y += 0.45) {
      for (let i = 0; i < 3; i++) {
        const a = legs[i]!;
        const b = legs[(i + 1) % 3]!;
        lattice.segment(at(a, y), at(b, y));
        lattice.segment(at(a, y), at(b, Math.min(1.6, y + 0.45)));
      }
    }
    // Whip antennas.
    lattice.segment(v3(1.15, 1.6, 0), v3(1.15, 3.4, 0));
    lattice.segment(v3(-1.15, 1.6, 0), v3(-1.15, 2.9, 0));
    // Deck plate outline.
    lattice.circle(v3(0, -2, 0), 0.9, v3(1, 0, 0), v3(0, 0, 1), 32);
    return {
      lattice: lattice.build(),
      yard: new THREE.BoxGeometry(2.6, 0.08, 0.2),
      platform: new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18),
      scannerBar: new THREE.BoxGeometry(1.8, 0.1, 0.12),
      pedestal: new THREE.CylinderGeometry(0.1, 0.14, 0.3, 10),
      dome: new THREE.SphereGeometry(0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      small: new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      stalk: new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6),
    };
  }, []);

  return (
    <group position={[0, -0.6, 0]}>
      <Lines geometry={geo.lattice} />
      <Part geometry={geo.yard} position={[0, 1.6, 0]} />
      <Part geometry={geo.platform} threshold={10} position={[0, 2.2, 0]} />
      <Part geometry={geo.pedestal} position={[0, 2.4, 0]} />
      <group ref={scanner} position={[0, 2.6, 0]}>
        <Part geometry={geo.scannerBar} />
      </group>
      {/* Domes on the yard arms */}
      <Part geometry={geo.stalk} position={[0.65, 1.85, 0]} />
      <Part geometry={geo.dome} threshold={1} position={[0.65, 2.07, 0]} />
      <Part geometry={geo.stalk} position={[-0.65, 1.85, 0]} />
      <Part geometry={geo.small} threshold={1} position={[-0.65, 2.07, 0]} />
      <SignalRings origin={[1.15, 3.4, 0]} delay={0} />
      <SignalRings origin={[-1.15, 2.9, 0]} delay={1.3} />

      <Tag position={[0.35, 3.0, 0.4]}>{labels.radar}</Tag>
      <Tag position={[1.85, 1.75, 0]}>{labels.satcom}</Tag>
      <Tag position={[-1.85, 1.75, 0]}>{labels.gps}</Tag>
      <Tag position={[1.35, 3.95, 0]}>{labels.vhf}</Tag>
      <Tag position={[-1.45, 3.45, 0]}>{labels.cell}</Tag>
    </group>
  );
}
