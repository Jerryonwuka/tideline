"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { startAdHocTripAction, type FerryState } from "@/app/(app)/(org)/ferry-actions";

type Option = { id: string; label: string };

export function NewTripForm({ vessels, routes }: { vessels: Option[]; routes: Option[] }) {
  const t = useTranslations("captain.newTrip");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FerryState, FormData>(startAdHocTripAction, {});
  const [routeId, setRouteId] = useState(routes[0]?.id ?? "");
  // One key per attempt, so a retried submit can't create two trips (offline sync uses the same idea).
  const [clientId] = useState(() => crypto.randomUUID());
  const field = "h-14 w-full rounded-sm border border-hairline-strong bg-surface-sunken px-4 text-lg text-foreground";
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <FormError message={state.error ? te(state.error) : null} />
      <label className="flex flex-col gap-2">
        <span className="label-mono-sm text-meta">{t("vessel")}</span>
        <select name="vesselId" className={field}>
          {vessels.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2">
        <span className="label-mono-sm text-meta">{t("route")}</span>
        <select name="routeId" value={routeId} onChange={(e) => setRouteId(e.target.value)} className={field}>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
          <option value="">{t("noRoute")}</option>
        </select>
      </label>
      {!routeId && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 label-mono-sm text-meta">{t("orTypeEnds")}</legend>
          <input name="originText" placeholder={t("from")} aria-label={t("from")} required className={field} />
          <input name="destinationText" placeholder={t("to")} aria-label={t("to")} required className={field} />
        </fieldset>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-14 rounded-sm bg-primary label-mono text-primary-foreground disabled:opacity-50"
      >
        {t("start")}
      </button>
    </form>
  );
}
