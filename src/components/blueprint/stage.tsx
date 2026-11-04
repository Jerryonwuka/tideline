"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Vector3 } from "three";
import { BlueprintMaterials, useBlueprintPalette } from "./kit";

interface StageProps {
  children: ReactNode;
  camera: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  autoRotateSpeed?: number;
  /** Called with the camera's heading in degrees (0–359) as the model turns. */
  onHeading?: (deg: number) => void;
  className?: string;
  label: string;
  /** Width/height ratio the camera distance was tuned for; narrower frames pull the camera back. */
  fitAspect?: number;
}

/** Keeps the model in frame on narrow screens by moving the camera back along its current line. */
function FitCamera({
  camera,
  target,
  fitAspect,
}: {
  camera: [number, number, number];
  target: [number, number, number];
  fitAspect: number;
}) {
  const size = useThree((s) => s.size);
  const cam = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { update(): void } | null;
  useEffect(() => {
    const t = new Vector3(...target);
    const base = new Vector3(...camera).sub(t).length();
    const aspect = size.width / Math.max(1, size.height);
    const distance = base * Math.max(1, fitAspect / aspect);
    const dir = cam.position.clone().sub(t).normalize();
    cam.position.copy(t.addScaledVector(dir, distance));
    controls?.update();
  }, [size.width, size.height, cam, controls, camera, target, fitAspect]);
  return null;
}

function HeadingReporter({ onHeading }: { onHeading?: (deg: number) => void }) {
  const controls = useThree((s) => s.controls) as unknown as {
    getAzimuthalAngle(): number;
    addEventListener(type: "change", fn: () => void): void;
    removeEventListener(type: "change", fn: () => void): void;
  } | null;
  useEffect(() => {
    if (!controls || !onHeading) return;
    const report = () => {
      const deg = ((((controls.getAzimuthalAngle() * 180) / Math.PI) % 360) + 360) % 360;
      onHeading(Math.round(deg));
    };
    report();
    controls.addEventListener("change", report);
    return () => controls.removeEventListener("change", report);
  }, [controls, onHeading]);
  return null;
}

/**
 * A rotatable blueprint scene. Drag to turn it any way (pan and zoom are off so the page still
 * scrolls); it drifts round on its own when left alone, and stops rendering when off screen.
 */
export function BlueprintStage({
  children,
  camera,
  target = [0, 0, 0],
  fov = 30,
  autoRotateSpeed = 0.6,
  onHeading,
  className,
  label,
  fitAspect = 1,
}: StageProps) {
  const palette = useBlueprintPalette();
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = wrap.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      rootMargin: "100px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrap} className={className} role="img" aria-label={label}>
      {palette && (
        <Canvas
          // Continuous frames only while visible and moving; with reduced motion, draw on demand.
          frameloop={!visible ? "never" : reduced ? "demand" : "always"}
          dpr={[1, 1.5]}
          camera={{ position: camera, fov, near: 0.1, far: 200 }}
          gl={{ antialias: true, alpha: true }}
          className="cursor-grab touch-pan-y active:cursor-grabbing"
        >
          <BlueprintMaterials palette={palette}>{children}</BlueprintMaterials>
          <OrbitControls
            makeDefault
            target={target}
            enablePan={false}
            enableZoom={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.7}
            minPolarAngle={Math.PI * 0.12}
            maxPolarAngle={Math.PI * 0.62}
            autoRotate={!reduced && !interacting}
            autoRotateSpeed={autoRotateSpeed}
            onStart={() => {
              clearTimeout(idleTimer.current);
              setInteracting(true);
            }}
            onEnd={() => {
              idleTimer.current = setTimeout(() => setInteracting(false), 2500);
            }}
          />
          <HeadingReporter onHeading={onHeading} />
          <FitCamera camera={camera} target={target} fitAspect={fitAspect} />
        </Canvas>
      )}
    </div>
  );
}
