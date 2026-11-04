import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { VESSEL_TYPES, VesselIcon, type VesselType } from "./vessel-icons";

function VesselCell({ type, name, use, index }: { type: VesselType; name: string; use: string; index: number }) {
  return (
    <div
      className="group/vessel relative flex h-32 flex-col items-center justify-center gap-3 bg-surface/80 transition-colors duration-(--duration-tide) ease-tide hover:bg-surface-raised"
      style={{ "--reveal-delay": `${index * 70}ms` } as React.CSSProperties}
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
    </div>
  );
}

/** The band under the hero: every vessel type the platform runs, in a hairline grid. */
export async function VesselGrid() {
  const t = await getTranslations("home.fleet");
  const cells = VESSEL_TYPES.map((type, i) => (
    <VesselCell key={type} type={type} name={t(`types.${type}.name`)} use={t(`types.${type}.use`)} index={i} />
  ));
  return (
    <Reveal linesOnly id="fleet" className="scroll-mt-24">
      <div className="grid grid-cols-2 gap-px border-y border-hairline bg-hairline md:grid-cols-5 lg:grid-cols-6">
        {cells.slice(0, 2)}
        <div
          className={cn(
            "col-span-2 row-start-1 flex flex-col items-center justify-center gap-2 bg-surface-sunken/60 p-6 text-center md:col-span-5 lg:col-span-2 lg:row-start-auto",
          )}
        >
          <span className="label-mono-sm text-meta">{t("eyebrow")}</span>
          <span className="label-mono text-foreground">{t("count", { count: VESSEL_TYPES.length })}</span>
        </div>
        {cells.slice(2)}
      </div>
    </Reveal>
  );
}
