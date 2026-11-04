import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/motion/reveal";
import { VESSEL_TYPES, VesselIcon, type VesselType } from "./vessel-icons";

function VesselCell({ type, name, use, copy }: { type: VesselType; name: string; use: string; copy: boolean }) {
  return (
    <li
      aria-hidden={copy || undefined}
      className="group/vessel flex h-32 w-48 shrink-0 flex-col items-center justify-center gap-3 border-r border-hairline transition-colors duration-(--duration-tide) ease-tide hover:bg-surface-raised"
    >
      <div
        data-draw
        className="text-foreground/80 transition-[color,transform] duration-(--duration-tide) ease-tide group-hover/vessel:-translate-y-1 group-hover/vessel:text-accent"
      >
        <VesselIcon type={type} />
      </div>
      <div className="relative h-4 w-full overflow-hidden text-center">
        <span className="absolute inset-x-0 label-mono-sm text-meta transition-transform duration-(--duration-tide) ease-tide group-hover/vessel:-translate-y-full">
          {name}
        </span>
        <span className="absolute inset-x-0 translate-y-full label-mono-sm text-accent transition-transform duration-(--duration-tide) ease-tide group-hover/vessel:translate-y-0">
          {use}
        </span>
      </div>
    </li>
  );
}

/** The band under the hero: every vessel type the platform runs, drifting past like a harbour. */
export async function VesselGrid() {
  const t = await getTranslations("home.fleet");
  const cells = (copy: number) =>
    VESSEL_TYPES.map((type) => (
      <VesselCell
        key={`${copy}-${type}`}
        copy={copy === 1}
        type={type}
        name={t(`types.${type}.name`)}
        use={t(`types.${type}.use`)}
      />
    ));
  return (
    <Reveal linesOnly id="fleet" className="scroll-mt-24">
      <div className="flex border-y border-hairline bg-surface/60">
        <div className="z-10 flex w-36 shrink-0 flex-col justify-center gap-1.5 border-r border-hairline bg-background px-5 sm:w-48 sm:px-6">
          <span className="label-mono-sm text-meta">{t("eyebrow")}</span>
          <span className="label-mono text-foreground">{t("count", { count: VESSEL_TYPES.length })}</span>
        </div>
        <div className="group/marquee relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
          <ul className="flex w-max group-hover/marquee:[animation-play-state:paused] motion-safe:animate-[marquee_48s_linear_infinite]">
            {cells(0)}
            {cells(1)}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}
