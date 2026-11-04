"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { TripStatusChip } from "@/components/ferry/trip-status";
import { captainDb } from "@/lib/offline/db";
import { canRemove, isClosed, isOpen, seatsOf } from "@/lib/offline/model";
import { addPassenger, removePassenger, tripStep } from "@/lib/offline/store";
import type { TripStep } from "@/lib/schemas/sync";
import { cn } from "@/lib/utils";
import { go } from "../nav";
import { SyncBadge } from "../parts";

const big = "h-14 w-full rounded-sm label-mono disabled:opacity-40";
const input = "h-14 w-full rounded-sm border border-hairline-strong bg-surface-sunken px-4 text-lg text-foreground";

export function TripView({ tripKey }: { tripKey: string }) {
  const t = useTranslations("captain.trip");
  const te = useTranslations("errors");
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const data = useLiveQuery(async () => {
    const db = captainDb();
    const trip = await db.trips.get(tripKey);
    if (!trip) return { trip: null };
    const [entries, vessel, meta] = await Promise.all([
      db.manifest.where("tripKey").equals(tripKey).sortBy("createdAt"),
      db.vessels.get(trip.vesselId),
      db.meta.get("snapshot"),
    ]);
    return { trip, entries, vessel, meta };
  }, [tripKey]);

  if (!data) return null;
  if (!data.trip) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-body">{te("not_found")}</p>
      </div>
    );
  }
  const { trip, entries, vessel, meta } = data;
  const seats = seatsOf(entries ?? []);
  const capacity = vessel?.capacity ?? null;
  const open = isOpen(trip.status);
  const sailing = trip.status === "departed";
  const full = capacity != null && seats >= capacity;

  async function step(s: TripStep, extra?: { cash?: string }) {
    const r = await tripStep(tripKey, s, extra);
    setError(r.ok ? null : te(r.error));
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const r = await addPassenger(tripKey, {
      name: String(form.get("fullName") ?? "").trim() || undefined,
      phone: String(form.get("phone") ?? "").trim() || undefined,
      seats: Number(form.get("seats") || 1),
    });
    if (r.ok) {
      setError(null);
      setFormKey((k) => k + 1);
    } else setError(te(r.error));
  }

  async function arrive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cash = String(new FormData(e.currentTarget).get("cash") ?? "")
      .replace(/,/g, "")
      .trim();
    if (cash && !/^\d+(\.\d{1,2})?$/.test(cash)) return setError(te("validation"));
    await step("arrive", cash ? { cash } : undefined);
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="flex flex-col gap-2">
        <span className="flex items-center justify-between">
          <TripStatusChip status={trip.status} className="w-fit" />
          <SyncBadge synced={trip.synced} />
        </span>
        <h1 className="heading text-foreground">{trip.label}</h1>
        <p className="text-body">{vessel?.name}</p>
      </div>

      <div className="flex items-end justify-between rounded-md border border-hairline-strong p-4">
        <span className="label-mono-sm text-meta">{t("capacity")}</span>
        <span
          className={cn("font-mono text-3xl", full ? "text-warning" : "text-foreground")}
          data-testid="capacity-counter"
        >
          {capacity != null ? t("capacityOf", { count: seats, capacity }) : seats}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {sailing && (
        <p className="rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          {t("amendmentNote")}
        </p>
      )}

      {(open || sailing) && (
        <form key={formKey} onSubmit={add} className="flex flex-col gap-3">
          <span className="label-mono-sm text-meta">{t("addPassenger")}</span>
          <input
            name="fullName"
            placeholder={t("name")}
            aria-label={t("name")}
            required={meta?.namesRequired ?? true}
            minLength={2}
            className={input}
          />
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <input
              name="seats"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              defaultValue={1}
              aria-label={t("seats")}
              className={input}
            />
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder={t("phone")}
              aria-label={t("phone")}
              className={input}
            />
          </div>
          <button
            type="submit"
            disabled={full && !sailing}
            className={cn(big, "border border-hairline-strong text-foreground")}
          >
            {full && !sailing ? t("full") : t("add")}
          </button>
        </form>
      )}

      {entries && entries.length > 0 && (
        <ul className="rounded-md border border-hairline">
          {entries.map((x) => (
            <li
              key={x.key}
              className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
            >
              <span className="flex flex-col">
                <span className="text-foreground">
                  {x.name ?? t("quickAddHint")} · {x.seats}
                  {x.amendment && <span className="ml-2 label-mono-sm text-warning">{t("amendment")}</span>}
                </span>
                <SyncBadge synced={x.synced} />
              </span>
              {canRemove(trip) && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await removePassenger(tripKey, x.key);
                    setError(r.ok ? null : te(r.error));
                  }}
                  className="text-sm text-danger"
                >
                  {t("remove")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <button
          type="button"
          onClick={() => step("lifejackets")}
          className={cn(
            big,
            "border px-4 text-left normal-case",
            trip.lifejackets
              ? "border-success bg-success/10 text-foreground"
              : "border-hairline-strong text-foreground",
          )}
        >
          {`${trip.lifejackets ? "☑" : "☐"} ${t("lifejackets")}`}
        </button>
      )}
      {trip.status === "scheduled" && (
        <button
          type="button"
          onClick={() => step("boarding")}
          className={cn(big, "border border-hairline-strong text-foreground")}
        >
          {t("boarding")}
        </button>
      )}
      {open && (
        <button
          type="button"
          onClick={() => step("depart")}
          disabled={!trip.lifejackets || seats === 0}
          className={cn(big, "bg-primary text-primary-foreground")}
        >
          {t("depart")}
        </button>
      )}
      {sailing && (
        <form onSubmit={arrive} className="flex flex-col gap-3 rounded-md border border-hairline-strong p-4">
          <label className="flex flex-col gap-2">
            <span className="label-mono-sm text-meta">{t("cashLabel", { currency: trip.currency })}</span>
            <input
              name="cash"
              inputMode="decimal"
              placeholder="0"
              className="h-14 w-full rounded-sm border border-hairline-strong bg-surface-sunken px-4 font-mono text-2xl text-foreground"
            />
          </label>
          <button type="submit" className={cn(big, "bg-primary text-primary-foreground")}>
            {t("arrive")}
          </button>
        </form>
      )}
      {isClosed(trip.status) && <p className="rounded-sm border border-hairline p-4 text-body">{t("closed")}</p>}
    </div>
  );
}

function BackLink() {
  const t = useTranslations("captain.trip");
  return (
    <button type="button" onClick={() => go({ name: "today" })} className="w-fit text-sm text-body">
      ← {t("back")}
    </button>
  );
}
