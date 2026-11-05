"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { captainDb } from "@/lib/offline/db";
import { createTrip } from "@/lib/offline/store";
import { go } from "../nav";

const field = "h-14 w-full rounded-sm border border-hairline-strong bg-surface-sunken px-4 text-lg text-foreground";

export function NewTripView() {
  const t = useTranslations("captain.newTrip");
  const tc = useTranslations("captain.trip");
  const te = useTranslations("errors");
  const data = useLiveQuery(async () => ({
    vessels: await captainDb().vessels.toArray(),
    routes: await captainDb().routes.toArray(),
  }));
  const [routeId, setRouteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const route = routeId ?? data.routes[0]?.id ?? "";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const result = await createTrip({
      vesselId: String(form.get("vesselId")),
      routeId: route || undefined,
      originText: String(form.get("originText") ?? "").trim() || undefined,
      destinationText: String(form.get("destinationText") ?? "").trim() || undefined,
    });
    setBusy(false);
    if (result.ok) go({ name: "trip", key: result.value });
    else setError(te(result.error));
  }

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={() => go({ name: "today" })} className="w-fit text-sm text-body">
        ← {tc("back")}
      </button>
      <h1 className="heading text-foreground">{t("title")}</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-2">
          <span className="label-mono-sm text-meta">{t("vessel")}</span>
          <select name="vesselId" className={field}>
            {data.vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="label-mono-sm text-meta">{t("route")}</span>
          <select name="routeId" value={route} onChange={(e) => setRouteId(e.target.value)} className={field}>
            {data.routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
            <option value="">{t("noRoute")}</option>
          </select>
        </label>
        {!route && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 label-mono-sm text-meta">{t("orTypeEnds")}</legend>
            <input
              name="originText"
              placeholder={t("from")}
              aria-label={t("from")}
              required
              minLength={2}
              className={field}
            />
            <input
              name="destinationText"
              placeholder={t("to")}
              aria-label={t("to")}
              required
              minLength={2}
              className={field}
            />
          </fieldset>
        )}
        <button
          type="submit"
          disabled={busy}
          className="h-14 rounded-sm bg-primary label-mono text-primary-foreground disabled:opacity-50"
        >
          {t("start")}
        </button>
      </form>
    </div>
  );
}
