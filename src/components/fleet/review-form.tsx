"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { confirmDocumentAction, type FleetState } from "@/app/(app)/(org)/fleet-actions";

export function ReviewForm({
  doc,
}: {
  doc: {
    id: string;
    number: string | null;
    issuer: string | null;
    issue_date: string | null;
    expiry_date: string | null;
  };
}) {
  const t = useTranslations("fleet.document");
  const tu = useTranslations("fleet.upload");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FleetState, FormData>(confirmDocumentAction, {});
  return (
    <form action={action} className="flex flex-col gap-4 rounded-md border border-info/40 bg-accent-soft p-5">
      <input type="hidden" name="id" value={doc.id} />
      <div>
        <h2 className="title-md text-foreground">{t("reviewTitle")}</h2>
        <p className="mt-1 text-sm text-body">{t("reviewBody")}</p>
      </div>
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="r-number">{tu("number")}</Label>
          <Input id="r-number" name="number" defaultValue={doc.number ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="r-issuer">{tu("issuer")}</Label>
          <Input id="r-issuer" name="issuer" defaultValue={doc.issuer ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="r-issue">{tu("issueDate")}</Label>
          <Input id="r-issue" name="issueDate" type="date" defaultValue={doc.issue_date ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="r-expiry">{tu("expiryDate")}</Label>
          <Input id="r-expiry" name="expiryDate" type="date" defaultValue={doc.expiry_date ?? ""} />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="decision" value="confirm" disabled={pending}>
          {t("confirm")}
        </Button>
        <Button type="submit" name="decision" value="reject" variant="danger" disabled={pending}>
          {t("reject")}
        </Button>
      </div>
    </form>
  );
}
