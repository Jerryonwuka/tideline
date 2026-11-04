"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Brackets } from "@/components/marketing/brackets";
import { cn } from "@/lib/utils";
import { SegmentBuilder, useMaterials, v3 } from "./kit";
import { SHIP_ANCHORS, ShipModel } from "./ship-model";
import { BlueprintStage } from "./stage";

type Spot = keyof typeof SHIP_ANCHORS;
const SPOTS = Object.keys(SHIP_ANCHORS) as Spot[];

/** Faint drafting grid under the hull, a 2 m square grid. */
function Floor() {
  const m = useMaterials();
  const geometry = useMemo(() => {
    const sb = new SegmentBuilder();
    for (let i = -14; i <= 14; i += 2) {
      sb.segment(v3(i, -2.45, -8), v3(i, -2.45, 8));
      if (Math.abs(i) <= 8) sb.segment(v3(-14, -2.45, i), v3(14, -2.45, i));
    }
    return sb.build();
  }, []);
  return <lineSegments geometry={geometry} material={m.ghost} />;
}

/**
 * A hotspot pinned to the model. Side-mounted spots jump to whichever side of the ship faces the
 * camera; a spot fades out when it turns away.
 */
function Hotspot({ spot, active, onSelect }: { spot: Spot; active: boolean; onSelect: (s: Spot) => void }) {
  const t = useTranslations("home.hero.ship.spots");
  const button = useRef<HTMLButtonElement>(null);
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const { position, normal } = SHIP_ANCHORS[spot];
  const base = useMemo(() => new THREE.Vector3(...position), [position]);
  const n = useMemo(() => new THREE.Vector3(...normal).normalize(), [normal]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const flipped = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const el = button.current;
    const g = group.current;
    if (!el || !g) return;
    // Use the starboard anchor or its port mirror, whichever faces the camera more.
    flipped.set(base.x, base.y, -base.z);
    const facingStar = tmp.copy(camera.position).sub(base).normalize().dot(n);
    const facingPort = tmp
      .copy(camera.position)
      .sub(flipped)
      .normalize()
      .dot(v3(n.x, n.y, -n.z));
    const usePort = n.z !== 0 && facingPort > facingStar;
    g.position.copy(usePort ? flipped : base);
    const visible = Math.max(facingStar, n.z !== 0 ? facingPort : -1) > -0.1;
    el.style.opacity = visible ? "1" : "0";
    el.style.pointerEvents = visible ? "auto" : "none";
  });

  return (
    <group ref={group} position={base}>
      <Html center zIndexRange={[20, 0]}>
        <button
          ref={button}
          type="button"
          onClick={() => onSelect(spot)}
          aria-pressed={active}
          className="group/spot flex cursor-pointer items-center gap-2 transition-opacity duration-300"
        >
          <span className="relative flex size-4 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-pill bg-accent/40 [animation-duration:2.4s]" />
            <span
              className={cn(
                "relative size-2.5 rounded-pill border border-accent",
                active ? "bg-accent" : "bg-background",
              )}
            />
          </span>
          <span
            className={cn(
              "rounded-xs border border-hairline-strong bg-background/85 px-2 py-1 label-mono-sm whitespace-nowrap backdrop-blur transition-colors",
              active ? "text-foreground" : "text-meta group-hover/spot:text-foreground",
            )}
          >
            {t(`${spot}.label`)}
          </span>
        </button>
      </Html>
    </group>
  );
}

/**
 * The hero's interactive general-arrangement drawing. Drag to turn the ship through 360°;
 * tap a point to see which part of Tideline looks after it.
 */
export default function ShipHero({ className }: { className?: string }) {
  const t = useTranslations("home.hero.ship");
  const [active, setActive] = useState<Spot>("bridge");
  const headingRef = useRef<HTMLSpanElement>(null);
  const onHeading = useCallback((deg: number) => {
    if (headingRef.current) headingRef.current.textContent = String(deg).padStart(3, "0");
  }, []);

  return (
    <div className={cn("relative flex flex-col", className)}>
      <div className="relative h-[19rem] sm:h-auto sm:flex-1">
        <BlueprintStage
          label={t("aria")}
          camera={[24.5, 11, 29.5]}
          target={[0.4, 0.1, 0]}
          fov={30}
          autoRotateSpeed={0.55}
          onHeading={onHeading}
          fitAspect={1.05}
          className="absolute inset-0"
        >
          <ShipModel />
          <Floor />
          {SPOTS.map((s) => (
            <Hotspot key={s} spot={s} active={active === s} onSelect={setActive} />
          ))}
        </BlueprintStage>

        {/* Drawing frame and title block */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <Brackets size={14} className="text-foreground/30" />
          <div className="absolute top-4 left-4 flex flex-col gap-1">
            <span className="label-mono-sm text-foreground">{t("title")}</span>
            <span className="label-mono-sm text-meta">{t("subtitle")}</span>
          </div>
          <div className="absolute top-4 right-4 text-right label-mono-sm text-meta">
            {t("heading")} <span ref={headingRef}>000</span>°
          </div>
          <div className="absolute bottom-4 left-4 hidden items-center gap-3 label-mono-sm text-meta lg:flex">
            <span className="flex h-2 w-20 border border-t-0 border-current" />
            {t("scale")}
          </div>
        </div>
      </div>

      {/* What the selected point is about: under the drawing on phones, inset on larger screens */}
      <div className="relative mt-3 w-full sm:absolute sm:right-4 sm:bottom-4 sm:mt-0 sm:w-72">
        <div
          key={active}
          className="animate-in rounded-xs border border-hairline-strong panel p-4 shadow-lg duration-500 fade-in-0 slide-in-from-bottom-1"
        >
          <span className="label-mono-sm text-accent">{t(`spots.${active}.label`)}</span>
          <p className="mt-2 text-sm text-foreground">{t(`spots.${active}.title`)}</p>
          <p className="mt-1 text-xs leading-5 text-body">{t(`spots.${active}.body`)}</p>
        </div>
        <p className="mt-2 label-mono-sm text-meta sm:text-right">{t("hint")}</p>
      </div>
    </div>
  );
}
