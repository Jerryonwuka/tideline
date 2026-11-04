"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LifeboatModel } from "./lifeboat-model";
import { MastModel } from "./mast-model";
import { BlueprintStage } from "./stage";

/** Lifeboat on its davits, with the four departure checks ticking through to "cleared". */
export function SafetyScene() {
  const t = useTranslations("home.platform.safety.demo");
  const checks = t.raw("checks") as string[];
  const [passed, setPassed] = useState(checks.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPassed(0);
    const id = setInterval(() => setPassed((n) => (n > checks.length ? 0 : n + 1)), 900);
    return () => clearInterval(id);
  }, [checks.length]);

  const cleared = passed >= checks.length;
  return (
    <div className="relative h-[22rem] w-full sm:h-[26rem]">
      <BlueprintStage
        label={t("aria")}
        camera={[6.4, 3.6, 7.6]}
        target={[0, 0.1, -0.6]}
        fov={34}
        className="absolute inset-0"
      >
        <LifeboatModel />
      </BlueprintStage>
      <ul className="pointer-events-none absolute top-0 left-0 flex flex-col gap-1.5">
        {checks.map((c, i) => (
          <li
            key={c}
            className={cn(
              "flex items-center gap-2 rounded-xs border px-2.5 py-1.5 label-mono-sm backdrop-blur transition-colors duration-300",
              i < passed
                ? "border-success/40 bg-background/80 text-foreground"
                : "border-hairline bg-background/60 text-meta",
            )}
          >
            <span
              className={cn(
                "flex size-3.5 items-center justify-center rounded-pill border transition-colors",
                i < passed ? "border-success bg-success text-background" : "border-hairline-strong",
              )}
            >
              {i < passed && <Check className="size-2.5" strokeWidth={3} />}
            </span>
            {c}
          </li>
        ))}
      </ul>
      <div
        className={cn(
          "pointer-events-none absolute right-0 bottom-0 rounded-xs px-3 py-2 label-mono-sm transition-all duration-500",
          cleared ? "bg-primary text-primary-foreground opacity-100" : "translate-y-1 opacity-0",
        )}
      >
        {t("top")}
      </div>
    </div>
  );
}

/** Communications mast: each antenna labelled with the service it carries. */
export function ConnectScene() {
  const t = useTranslations("home.platform.connect.demo");
  return (
    <div className="relative h-[22rem] w-full sm:h-[24rem]">
      <BlueprintStage
        label={t("aria")}
        camera={[4.5, 2.6, 6.5]}
        target={[0, 0.5, 0]}
        fov={40}
        className="absolute inset-0"
      >
        <MastModel labels={{ radar: t("radar"), gps: t("gps"), satcom: t("satcom"), vhf: t("vhf"), cell: t("cell") }} />
      </BlueprintStage>
    </div>
  );
}
