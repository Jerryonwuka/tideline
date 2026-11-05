"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { resolveDisputeAction, type ResolveState } from "./actions";

/** Release, refund or split a frozen hold (owner's share entered in minor units). */
export function ResolveForm({ holdId, currency }: { holdId: string; currency: string }) {
  const t = useTranslations("adminDisputes");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<ResolveState, FormData>(resolveDisputeAction, {});
  if (state.ok) return <p className="text-sm text-foreground">{t("resolved")}</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="holdId" value={holdId} />
      <FormError message={state.error ? te(state.error) : null} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={`share-${holdId}`}>{t("ownerShare", { currency })}</Label>
        <Input id={`share-${holdId}`} name="ownerShareMinor" inputMode="numeric" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="action" value="release" disabled={pending}>
          {t("release")}
        </Button>
        <Button type="submit" name="action" value="refund" variant="secondary" disabled={pending}>
          {t("refund")}
        </Button>
        <Button type="submit" name="action" value="split" variant="ghost" disabled={pending}>
          {t("split")}
        </Button>
      </div>
    </form>
  );
}
