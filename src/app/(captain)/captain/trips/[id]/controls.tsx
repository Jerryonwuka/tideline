"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  addPassengerAction,
  removePassengerAction,
  tripStepAction,
  type FerryState,
} from "@/app/(app)/(org)/ferry-actions";
import { cn } from "@/lib/utils";

interface Props {
  tripId: string;
  status: "scheduled" | "boarding" | "departed" | "arrived" | "cancelled";
  seats: number;
  capacity: number | null;
  lifejackets: boolean;
  currency: string;
  namesRequired: boolean;
  passengers: { id: string; name: string | null; seats: number; amendment: boolean }[];
}

const big = "h-14 w-full rounded-sm label-mono disabled:opacity-40";

function Step({
  tripId,
  step,
  label,
  className,
  disabled,
  extra,
}: {
  tripId: string;
  step: string;
  label: string;
  className: string;
  disabled?: boolean;
  extra?: Record<string, string>;
}) {
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FerryState, FormData>(tripStepAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="step" value={step} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" disabled={pending || disabled} className={cn(big, className)}>
        {label}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {te(state.error)}
        </p>
      )}
    </form>
  );
}

export function CaptainTripControls(p: Props) {
  const t = useTranslations("captain.trip");
  const te = useTranslations("errors");
  const [added, addAction, adding] = useActionState<FerryState, FormData>(addPassengerAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (added.ok) {
      formRef.current?.reset();
      setClientId(crypto.randomUUID());
    }
  }, [added]);

  const open = p.status === "scheduled" || p.status === "boarding";
  const sailing = p.status === "departed";
  const full = p.capacity != null && p.seats >= p.capacity;
  const input = "h-14 w-full rounded-sm border border-hairline-strong bg-surface-sunken px-4 text-lg text-foreground";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between rounded-md border border-hairline-strong p-4">
        <span className="label-mono-sm text-meta">{t("capacity")}</span>
        <span
          className={cn("font-mono text-3xl", full ? "text-warning" : "text-foreground")}
          data-testid="capacity-counter"
        >
          {p.capacity != null ? t("capacityOf", { count: p.seats, capacity: p.capacity }) : p.seats}
        </span>
      </div>

      {sailing && (
        <p className="rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          {t("amendmentNote")}
        </p>
      )}

      {(open || sailing) && (
        <form ref={formRef} action={addAction} className="flex flex-col gap-3">
          <input type="hidden" name="tripId" value={p.tripId} />
          <input type="hidden" name="clientId" value={clientId} />
          <span className="label-mono-sm text-meta">{t("addPassenger")}</span>
          <input
            name="fullName"
            placeholder={t("name")}
            aria-label={t("name")}
            required={p.namesRequired}
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
          {added.error && (
            <p role="alert" className="text-sm text-danger">
              {te(added.error)}
            </p>
          )}
          <button
            type="submit"
            disabled={adding || (full && !sailing)}
            className={cn(big, "border border-hairline-strong text-foreground")}
          >
            {full && !sailing ? t("full") : t("add")}
          </button>
        </form>
      )}

      {p.passengers.length > 0 && (
        <ul className="rounded-md border border-hairline">
          {p.passengers.map((x) => (
            <li
              key={x.id}
              className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
            >
              <span className="text-foreground">
                {x.name ?? t("quickAddHint")} · {x.seats}
                {x.amendment && <span className="ml-2 label-mono-sm text-warning">{t("amendment")}</span>}
              </span>
              {open && (
                <form action={removePassengerAction}>
                  <input type="hidden" name="tripId" value={p.tripId} />
                  <input type="hidden" name="entryId" value={x.id} />
                  <button type="submit" className="text-sm text-danger">
                    {t("remove")}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Step
          tripId={p.tripId}
          step="lifejackets"
          extra={{ confirmed: String(!p.lifejackets) }}
          label={`${p.lifejackets ? "☑" : "☐"} ${t("lifejackets")}`}
          className={cn(
            "border text-left normal-case",
            p.lifejackets ? "border-success bg-success/10 text-foreground" : "border-hairline-strong text-foreground",
          )}
        />
      )}
      {p.status === "scheduled" && (
        <Step
          tripId={p.tripId}
          step="boarding"
          label={t("boarding")}
          className="border border-hairline-strong text-foreground"
        />
      )}
      {open && (
        <Step
          tripId={p.tripId}
          step="depart"
          label={t("depart")}
          disabled={!p.lifejackets || p.seats === 0}
          className="bg-primary text-primary-foreground"
        />
      )}
      {sailing && <ArriveForm tripId={p.tripId} currency={p.currency} />}
      {(p.status === "arrived" || p.status === "cancelled") && (
        <p className="rounded-sm border border-hairline p-4 text-body">{t("closed")}</p>
      )}
    </div>
  );
}

function ArriveForm({ tripId, currency }: { tripId: string; currency: string }) {
  const t = useTranslations("captain.trip");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FerryState, FormData>(tripStepAction, {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border border-hairline-strong p-4">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="step" value="arrive" />
      <label className="flex flex-col gap-2">
        <span className="label-mono-sm text-meta">{t("cashLabel", { currency })}</span>
        <input
          name="cash"
          inputMode="decimal"
          placeholder="0"
          className="h-14 w-full rounded-sm border border-hairline-strong bg-surface-sunken px-4 font-mono text-2xl text-foreground"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {te(state.error)}
        </p>
      )}
      <button type="submit" disabled={pending} className={cn(big, "bg-primary text-primary-foreground")}>
        {t("arrive")}
      </button>
    </form>
  );
}
