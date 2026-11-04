"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  createRouteAction,
  createScheduleAction,
  proposeJettyAction,
  type FerryState,
} from "@/app/(app)/(org)/ferry-actions";

type Option = { id: string; label: string };

function useResetOnSuccess(state: FerryState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function RouteForm({ jetties, currency }: { jetties: Option[]; currency: string }) {
  const t = useTranslations("ferry.routes");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FerryState, FormData>(createRouteAction, {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-4">
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="originJettyId">{t("origin")}</Label>
          <NativeSelect id="originJettyId" name="originJettyId">
            {jetties.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="destinationJettyId">{t("destination")}</Label>
          <NativeSelect id="destinationJettyId" name="destinationJettyId" defaultValue={jetties[1]?.id}>
            {jetties.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="durationMin">{t("duration")}</Label>
          <Input
            id="durationMin"
            name="durationMin"
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            defaultValue={45}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="baseFare">{t("fare", { currency })}</Label>
          <Input id="baseFare" name="baseFare" inputMode="decimal" required placeholder="1500" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("save")}
      </Button>
    </form>
  );
}

export function ScheduleForm({ routeId, vessels }: { routeId: string; vessels: Option[] }) {
  const t = useTranslations("ferry.routes");
  const tDays = useTranslations("weekdays");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FerryState, FormData>(createScheduleAction, {});
  const ref = useResetOnSuccess(state);
  return (
    <form
      ref={ref}
      action={action}
      className="flex flex-col gap-3 rounded-sm border border-dashed border-hairline-strong p-3"
    >
      <input type="hidden" name="routeId" value={routeId} />
      <FormError message={state.error ? te(state.error) : null} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="label-mono-sm text-meta">{t("vessel")}</span>
          <NativeSelect name="vesselId" className="h-9 text-sm">
            {vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-mono-sm text-meta">{t("time")}</span>
          <Input name="departureTime" type="time" required className="h-9 w-32 text-sm" />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="label-mono-sm text-meta">{t("days")}</legend>
          <div className="flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <label
                key={d}
                className="flex cursor-pointer items-center gap-1 rounded-xs border border-hairline-strong px-2 py-1 text-xs has-checked:border-accent has-checked:bg-accent-soft"
              >
                <input type="checkbox" name="days" value={d} defaultChecked className="sr-only" />
                {tDays(String(d))}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !vessels.length} className="h-9">
          {t("saveSchedule")}
        </Button>
      </div>
    </form>
  );
}

export function ProposeJettyForm() {
  const t = useTranslations("ferry.routes");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FerryState, FormData>(proposeJettyAction, {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <FormError message={state.error ? te(state.error) : null} />
      {state.ok && (
        <p role="status" className="text-sm text-success">
          {t("proposed")}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <Input name="name" placeholder={t("jettyName")} aria-label={t("jettyName")} required minLength={2} />
        <Input name="aliases" placeholder={t("aliases")} aria-label={t("aliases")} />
        <Input name="lat" inputMode="decimal" placeholder={t("lat")} aria-label={t("lat")} required />
        <Input name="lng" inputMode="decimal" placeholder={t("lng")} aria-label={t("lng")} required />
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="w-fit">
        {t("propose")}
      </Button>
    </form>
  );
}
