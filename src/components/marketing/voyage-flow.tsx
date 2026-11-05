"use client";

import { Banknote, CircleDollarSign, Landmark, MessageCircle, Smartphone, Sparkles, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Brackets } from "./brackets";

interface Trip {
  vessel: string;
  pax: string;
  load: number;
}
interface Event {
  vessel: string;
  text: string;
}
interface Takings {
  label: string;
  amount: string;
}

const CHIP_Y = [22, 50, 78];
const TAKINGS_ICONS = [Banknote, Landmark, CircleDollarSign];

/**
 * Trips on the left feed events in the middle, which roll up into the day's takings on the right.
 * The highlighted event cycles, and its connector carries a moving dash.
 */
export function VoyageFlow() {
  const t = useTranslations("home.process.demo");
  const trips = t.raw("trips") as Trip[];
  const events = t.raw("events") as Event[];
  const takings = t.raw("takings") as Takings[];
  const [active, setActive] = useState(1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((i) => (i + 1) % events.length), 2600);
    return () => clearInterval(id);
  }, [events.length]);

  return (
    <div className="relative">
      {/* The loop: check before departure → log every voyage → back again. */}
      <div
        aria-hidden
        className="absolute inset-x-[14%] top-6 bottom-6 hidden rounded-xs border border-hairline-strong lg:block"
      />
      <LoopLabel position="top">{t("loopTop")}</LoopLabel>
      <LoopLabel position="bottom">{t("loopBottom")}</LoopLabel>

      <div className="relative grid items-center gap-8 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-0 lg:py-24">
        {/* Left: today's trips */}
        <div className="relative z-10 rounded-xs border border-hairline-strong panel shadow-lg">
          <div className="grid grid-cols-[1fr_auto_4.5rem] gap-4 border-b border-hairline px-4 py-3 text-sm text-foreground">
            <span>{t("columns.vessel")}</span>
            <span>{t("columns.pax")}</span>
            <span>{t("columns.load")}</span>
          </div>
          {trips.map((trip, i) => (
            <div
              key={trip.vessel}
              className={cn(
                "grid grid-cols-[1fr_auto_4.5rem] items-center gap-4 px-4 py-2.5 text-sm transition-opacity duration-500",
                i > 2 ? "opacity-40" : i > 1 ? "opacity-70" : "",
              )}
            >
              <span className="truncate text-foreground">{trip.vessel}</span>
              <span className="font-mono text-xs text-body">{trip.pax}</span>
              <span className="flex gap-1" aria-label={`${trip.load}/3`}>
                {[0, 1, 2].map((k) => (
                  <span
                    key={k}
                    className={cn("h-1 flex-1 rounded-pill", k < trip.load ? "bg-foreground/80" : "bg-hairline-strong")}
                  />
                ))}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
            <span className="label-mono-sm text-meta">{t("sources")}</span>
            <span className="flex gap-1.5 text-body">
              {[Smartphone, MessageCircle, WifiOff].map((Icon, i) => (
                <span
                  key={i}
                  className="flex size-6 items-center justify-center rounded-xs border border-hairline-strong bg-surface-raised"
                >
                  <Icon className="size-3" />
                </span>
              ))}
            </span>
          </div>
        </div>

        {/* Middle: events with connectors */}
        <div className="relative lg:min-h-[19rem]">
          <svg
            aria-hidden
            className="absolute inset-0 hidden size-full lg:block"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {CHIP_Y.map((y, i) => (
              <g key={y}>
                <path
                  d={`M0 50 C 8 50, 8 ${y}, 16 ${y}`}
                  fill="none"
                  stroke={i === active ? "var(--foreground)" : "var(--hairline-strong)"}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  className="transition-[stroke] duration-500"
                />
                <path
                  d={`M84 ${y} C 92 ${y}, 92 50, 100 50`}
                  fill="none"
                  stroke={i === active ? "var(--foreground)" : "var(--hairline-strong)"}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  className="transition-[stroke] duration-500"
                />
                {i === active && (
                  <path
                    d={`M0 50 C 8 50, 8 ${y}, 16 ${y} M84 ${y} C 92 ${y}, 92 50, 100 50`}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                    strokeDasharray="3 9"
                    vectorEffect="non-scaling-stroke"
                    className="motion-safe:animate-dash"
                  />
                )}
              </g>
            ))}
          </svg>
          <ul className="flex flex-col gap-3 lg:contents">
            {events.map((ev, i) => (
              <li
                key={ev.text}
                className={cn(
                  "z-10 flex items-center gap-2.5 rounded-pill border px-4 py-2 text-sm whitespace-nowrap transition-[background-color,border-color,color,opacity,transform] duration-500 ease-tide lg:absolute lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2",
                  i === active
                    ? "border-transparent bg-primary text-primary-foreground shadow-lg lg:scale-105"
                    : "border-hairline-strong bg-surface text-meta opacity-80",
                )}
                style={{ top: `${CHIP_Y[i]}%` }}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-xs text-[10px] font-semibold",
                    i === active ? "bg-accent text-accent-foreground" : "bg-surface-raised text-body",
                  )}
                >
                  {ev.vessel.slice(0, 1)}
                </span>
                {ev.vessel} · {ev.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: the day's takings */}
        <div className="relative z-10 rounded-xs border border-hairline-strong panel shadow-lg">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <span className="text-sm text-foreground">{t("takingsTitle")}</span>
            <span className="label-mono-sm text-meta">{t("today")}</span>
          </div>
          <div className="px-4 pt-4">
            <div className="flex h-7 gap-1">
              <span className="w-[46%] rounded-xs bg-foreground/25" />
              <span className="w-[34%] rounded-xs bg-accent" />
              <span className="w-[20%] rounded-xs bg-foreground/15" />
            </div>
          </div>
          <ul className="px-4 py-3">
            {takings.map((row, i) => {
              const Icon = TAKINGS_ICONS[i] ?? Banknote;
              return (
                <li
                  key={row.label}
                  className="flex items-center gap-3 border-l border-hairline-strong py-1.5 pl-3 text-sm"
                >
                  <Icon className="size-3.5 text-body" />
                  <span className="text-foreground">{row.label}</span>
                  <span className="ml-auto font-mono text-xs text-body">{row.amount}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3 border-t border-hairline px-4 py-3 text-sm">
            <Sparkles className="size-3.5 text-accent" />
            <span className="text-foreground">{t("next")}</span>
            <span className="ml-auto truncate rounded-xs bg-surface-raised px-2 py-1 text-xs text-body">
              {t("suggestion")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoopLabel({ children, position }: { children: React.ReactNode; position: "top" | "bottom" }) {
  return (
    <div
      className={cn(
        "absolute left-1/2 z-10 hidden -translate-x-1/2 lg:flex",
        position === "top" ? "top-6 -translate-y-1/2" : "bottom-6 translate-y-1/2",
      )}
    >
      <span className="group/brackets relative flex bg-background px-5 py-2.5 label-mono text-foreground">
        <Brackets size={8} className="text-foreground/70" />
        {children}
      </span>
    </div>
  );
}
