"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Brackets } from "./brackets";

interface Row {
  event: string;
  source: string;
}

/** A captain's live activity feed; the highlight walks down the rows as events "arrive". */
export function ControlRoom() {
  const t = useTranslations("home.platform.crew.demo");
  const rows = t.raw("rows") as Row[];
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((i) => (i + 1) % rows.length), 1800);
    return () => clearInterval(id);
  }, [rows.length]);

  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* Arcs behind the card, like a radar sweep. */}
      <svg
        aria-hidden
        viewBox="0 0 400 300"
        className="absolute top-1/2 left-1/2 w-[140%] -translate-x-1/2 -translate-y-1/2 text-hairline-strong"
      >
        {[60, 100, 140].map((r) => (
          <ellipse key={r} cx="200" cy="150" rx={r * 1.6} ry={r * 0.7} fill="none" stroke="currentColor" />
        ))}
      </svg>
      <div className="group/brackets relative">
        <Brackets size={8} offset={6} className="text-foreground/50" />
        <div className="relative flex items-center gap-3 rounded-xs border border-hairline-strong bg-surface-raised px-4 py-3 shadow-md">
          <span className="flex size-9 items-center justify-center rounded-pill bg-[linear-gradient(135deg,var(--color-sky-500),var(--color-sky-200))] text-xs font-medium text-ink-950">
            {t("initials")}
          </span>
          <span className="flex flex-col">
            <span className="text-sm text-foreground">{t("name")}</span>
            <span className="text-xs text-meta">{t("role")}</span>
          </span>
          <span className="ml-auto flex items-center gap-1.5 label-mono-sm text-success">
            <span className="size-1.5 animate-pulse-ring rounded-pill bg-success" />
            {t("live")}
          </span>
        </div>
      </div>
      <ul className="relative mt-3 flex flex-col gap-1">
        {rows.map((row, i) => (
          <li
            key={row.event}
            className={`flex items-center justify-between rounded-xs border px-4 py-2.5 text-sm transition-[background-color,border-color,color,transform] duration-500 ease-tide ${
              i === active
                ? "translate-x-1 border-hairline-strong bg-surface-raised text-foreground"
                : "border-transparent bg-surface/60 text-body"
            }`}
          >
            <span>{row.event}</span>
            <span className={i === active ? "text-accent" : "text-meta"}>{row.source}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
