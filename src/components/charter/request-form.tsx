"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createRequestAction, type CharterState } from "@/app/(app)/(org)/charter-actions";

/** A charterer's request for a listed vessel. */
export function RequestForm({ listingId, orgId, currency }: { listingId: string; orgId: string; currency: string }) {
  const t = useTranslations("charter.listing");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<CharterState, FormData>(createRequestAction, {});
  if (state.ok)
    return (
      <p className="mt-2 text-foreground" role="status">
        {t("sent")}
      </p>
    );
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="currency" value={currency} />
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">{t("fields.startDate")}</Label>
          <Input id="startDate" name="startDate" type="date" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">{t("fields.endDate")}</Label>
          <Input id="endDate" name="endDate" type="date" required />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">{t("fields.location")}</Label>
        <Input id="location" name="location" required minLength={2} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="purpose">{t("fields.purpose")}</Label>
        <Input id="purpose" name="purpose" required minLength={3} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="crewNeeds">{t("fields.crewNeeds")}</Label>
          <Input id="crewNeeds" name="crewNeeds" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="budget">{t("fields.budget")}</Label>
          <Input id="budget" name="budget" inputMode="decimal" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("fields.send")}
      </Button>
    </form>
  );
}
