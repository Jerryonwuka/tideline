"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StatusChip, type Tone } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

const MODES = ["ferry", "charter", "compliance"] as const;
type Mode = (typeof MODES)[number];

interface Item {
  label: string;
  value: string;
  tone: Tone;
}

/** Tabbed tour of the three ways operators use Tideline, each with a live-looking panel. */
export function ModeTabs() {
  const t = useTranslations("home.modes");
  const [mode, setMode] = useState<Mode>("ferry");

  return (
    <div>
      <div
        role="tablist"
        aria-label={t("tablist")}
        className="flex w-fit max-w-full overflow-x-auto rounded-xs border border-hairline-strong"
      >
        {MODES.map((m) => (
          <button
            key={m}
            role="tab"
            id={`mode-tab-${m}`}
            aria-selected={mode === m}
            aria-controls={`mode-panel-${m}`}
            onClick={() => setMode(m)}
            className={cn(
              "cursor-pointer px-5 py-2.5 label-mono-sm transition-colors duration-(--duration-tide) ease-tide not-last:border-r not-last:border-hairline-strong",
              mode === m ? "bg-primary text-primary-foreground" : "text-meta hover:text-foreground",
            )}
          >
            {t(`${m}.tab`)}
          </button>
        ))}
      </div>

      {MODES.map((m) => {
        const bullets = t.raw(`${m}.bullets`) as string[];
        const items = t.raw(`${m}.panel.items`) as Item[];
        return (
          <div
            key={m}
            role="tabpanel"
            id={`mode-panel-${m}`}
            aria-labelledby={`mode-tab-${m}`}
            hidden={mode !== m}
            className="mt-12 grid animate-in items-center gap-10 duration-700 fade-in-0 slide-in-from-bottom-2 lg:grid-cols-2 lg:gap-16"
          >
            <div>
              <span className="label-mono-sm text-accent">{t(`${m}.eyebrow`)}</span>
              <h3 className="mt-4 display-sm text-foreground">{t(`${m}.title`)}</h3>
              <p className="mt-4 body-lg text-body">{t(`${m}.body`)}</p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[0.9375rem] text-body">
                    <Check className="mt-1 size-3.5 shrink-0 text-accent" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-sm border border-hairline-strong panel p-1.5 shadow-lg">
              <div className="flex items-center justify-between rounded-xs bg-surface-raised px-4 py-3">
                <span className="text-sm text-foreground">{t(`${m}.panel.title`)}</span>
                <span className="label-mono-sm text-meta">{t(`${m}.panel.meta`)}</span>
              </div>
              {m === "ferry" && (
                <div className="px-4 pt-5">
                  <div className="flex items-baseline justify-between">
                    <span className="label-mono-sm text-meta">{t("ferry.panel.capacityLabel")}</span>
                    <span className="font-mono text-sm text-foreground">{t("ferry.panel.capacity")}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-hairline-strong">
                    <div className="h-full w-[84%] rounded-pill bg-accent" />
                  </div>
                </div>
              )}
              <ul className="p-2">
                {items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-4 rounded-xs px-2 py-3 text-sm transition-colors not-last:border-b not-last:border-hairline hover:bg-surface-raised"
                  >
                    <span className="text-foreground">{item.label}</span>
                    <StatusChip tone={item.tone}>{item.value}</StatusChip>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
                <span className="text-xs text-meta">{t(`${m}.panel.footer`)}</span>
                <span className="rounded-xs bg-primary px-3 py-1.5 label-mono-sm text-primary-foreground">
                  {t(`${m}.panel.action`)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
