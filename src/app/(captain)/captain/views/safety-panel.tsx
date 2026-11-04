"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { canOverride } from "@/lib/safety/engine";
import { CHECK_VALID_MS, type LocalTrip } from "@/lib/offline/model";
import { acknowledgeSafety, requestOverride, runSafetyCheck } from "@/lib/offline/store";
import { cn } from "@/lib/utils";
import { useOnline } from "../parts";

const TONE = {
  pass: "border-success bg-success/10",
  warn: "border-warning bg-warning/10",
  block: "border-danger bg-danger/10",
} as const;

/** Safety lock before departure (§4.2): run the check, accept warnings, or ask for an override. */
export function SafetyPanel({ trip }: { trip: LocalTrip }) {
  const t = useTranslations("safety");
  const te = useTranslations("errors");
  const format = useFormatter();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const latest = trip.safety?.latest ?? null;
  const current = latest && Date.now() - Date.parse(latest.checkedAt) <= CHECK_VALID_MS ? latest : null;
  const timeZone = trip.safety?.timeZone;

  const run = async () => {
    setBusy(true);
    setError(null);
    await runSafetyCheck(trip.key);
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-3" aria-label={t("title")} data-testid="safety-panel">
      {current && (
        <div className={cn("flex flex-col gap-2 rounded-md border p-4", TONE[current.result])}>
          <span className="flex items-center justify-between gap-2">
            <strong className="text-lg text-foreground" data-testid="safety-result">
              {t(`result.${current.result}`)}
            </strong>
            <span className="text-sm text-body">
              {t("checkedAt", {
                time: format.dateTime(new Date(current.checkedAt), { timeStyle: "short", timeZone }),
              })}
            </span>
          </span>
          {current.reasons.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground">
              {current.reasons.map((r) => (
                <li key={r.code}>
                  {t(`reasons.${r.code}`, { value: String(r.value ?? ""), limit: String(r.limit ?? "") })}
                </li>
              ))}
            </ul>
          )}
          {current.offline && <p className="text-sm text-body">{t("offlineNote")}</p>}

          {current.result === "warn" &&
            (current.acknowledged ? (
              <p className="label-mono-sm text-meta">{t("acknowledged")}</p>
            ) : (
              <button
                type="button"
                onClick={() => acknowledgeSafety(trip.key)}
                className="h-12 rounded-sm border border-hairline-strong px-3 text-foreground"
              >
                {t("acknowledge")}
              </button>
            ))}

          {current.result === "block" &&
            (!canOverride(current.reasons) ? (
              <p className="text-sm text-foreground">{t("cannotOverride")}</p>
            ) : current.decision ? (
              <p className="text-sm text-foreground">
                {t(current.decision.decision, { reason: current.decision.reason })}
              </p>
            ) : current.requested ? (
              <p className="text-sm text-foreground">{t("requested")}</p>
            ) : !online ? (
              <p className="text-sm text-foreground">{t("overrideNeedsSignal")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("overrideNote")}
                  aria-label={t("overrideNote")}
                  maxLength={500}
                  className="h-12 rounded-sm border border-hairline-strong bg-surface-sunken px-3 text-foreground"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const r = await requestOverride(trip.key, note.trim() || undefined);
                    setBusy(false);
                    if (!r.ok)
                      setError(
                        r.code === "offline"
                          ? t("overrideNeedsSignal")
                          : te.has(r.code ?? "")
                            ? te(r.code as "unknown")
                            : te("unknown"),
                      );
                  }}
                  className="h-12 rounded-sm border border-hairline-strong px-3 text-foreground disabled:opacity-50"
                >
                  {t("requestOverride")}
                </button>
              </div>
            ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="h-14 w-full rounded-sm border border-hairline-strong label-mono text-foreground disabled:opacity-50"
      >
        {busy ? t("checking") : current ? t("recheck") : t("check")}
      </button>
    </section>
  );
}
