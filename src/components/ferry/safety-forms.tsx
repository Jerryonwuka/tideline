"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { Thresholds } from "@/lib/safety/engine";
import { decideOverrideAction, saveThresholdsAction, type SafetyState } from "@/app/(app)/(org)/safety-actions";

const NUMERIC = ["maxWindKmh", "maxGustKmh", "maxWaveM", "maxPrecipMmH"] as const;

export function ThresholdsForm({ current, defaults }: { current: Thresholds; defaults: Thresholds }) {
  const t = useTranslations("safety.thresholds");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<SafetyState, FormData>(saveThresholdsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {NUMERIC.map((k) => (
          <div key={k} className="flex flex-col gap-2">
            <Label htmlFor={k}>{t(k)}</Label>
            <Input id={k} name={k} inputMode="decimal" defaultValue={current[k]} required />
            <span className="text-xs text-meta">{t("defaults", { value: defaults[k] })}</span>
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <Label htmlFor="permittedStart">{t("permittedStart")}</Label>
          <Input id="permittedStart" name="permittedStart" type="time" defaultValue={current.permittedStart ?? ""} />
          <span className="text-xs text-meta">{t("defaults", { value: defaults.permittedStart ?? "—" })}</span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="permittedEnd">{t("permittedEnd")}</Label>
          <Input id="permittedEnd" name="permittedEnd" type="time" defaultValue={current.permittedEnd ?? ""} />
          <span className="text-xs text-meta">{t("defaults", { value: defaults.permittedEnd ?? "—" })}</span>
        </div>
      </div>
      <label className="flex items-center gap-2 text-foreground">
        <input type="checkbox" name="nightBlock" defaultChecked={current.nightBlock} />
        {t("nightBlock")}
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        {state.ok && <span className="text-sm text-body">{t("saved")}</span>}
      </div>
    </form>
  );
}

export function DecisionForm({ requestId }: { requestId: string }) {
  const t = useTranslations("safety.inbox");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<SafetyState, FormData>(decideOverrideAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <FormError message={state.error ? te(state.error) : null} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={`reason-${requestId}`}>{t("reason")}</Label>
        <Input id={`reason-${requestId}`} name="reason" required minLength={3} maxLength={500} />
      </div>
      <div className="flex gap-3">
        <Button type="submit" name="decision" value="approved" disabled={pending}>
          {t("approve")}
        </Button>
        <Button type="submit" name="decision" value="declined" variant="danger" disabled={pending}>
          {t("decline")}
        </Button>
      </div>
    </form>
  );
}
