"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { dataRequestAction, marketingAction, type PrivacyState } from "@/app/(app)/settings/privacy/actions";

export function MarketingForm({ granted }: { granted: boolean }) {
  const t = useTranslations("settingsPrivacy");
  const [state, action, pending] = useActionState<PrivacyState, FormData>(marketingAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="granted" defaultChecked={granted} />
        {t("marketing")}
      </label>
      <p className="text-xs text-meta">{t("marketingHint")}</p>
      <span className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("save")}
        </Button>
        {state.ok && <span className="text-sm text-meta">{t("saved")}</span>}
      </span>
    </form>
  );
}

export function DataRequestForm({ kind }: { kind: "export" | "delete" }) {
  const t = useTranslations("settingsPrivacy");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<PrivacyState, FormData>(dataRequestAction, {});
  if (state.ok === kind) return <p className="text-sm text-foreground">{t(`requested.${kind}`)}</p>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="kind" value={kind} />
      <FormError message={state.error ? te(state.error) : null} />
      {kind === "delete" && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="confirm" required />
          {t("confirmDelete")}
        </label>
      )}
      <Button type="submit" variant={kind === "delete" ? "danger" : "secondary"} disabled={pending} className="w-fit">
        {kind === "delete" ? t("requestDelete") : t("requestExport")}
      </Button>
    </form>
  );
}
