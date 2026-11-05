"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { confirmDocumentAction, type FleetState } from "@/app/(app)/(org)/fleet-actions";

interface Draft {
  number: string | null;
  issuer: string | null;
  issue_date: string | null;
  expiry_date: string | null;
}

/**
 * Human review. Prefills from the AI draft when there is one; fields the AI was unsure about are
 * highlighted, and a missing expiry is never filled in for the reviewer.
 */
export function ReviewForm({
  id,
  values,
  lowConfidence = [],
}: {
  id: string;
  values: Draft;
  lowConfidence?: string[];
}) {
  const t = useTranslations("fleet.document");
  const tu = useTranslations("fleet.upload");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FleetState, FormData>(confirmDocumentAction, {});
  const low = new Set(lowConfidence);
  const field = (key: keyof Draft, name: string, label: string, type = "text") => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`r-${name}`} className="flex items-center justify-between">
        {label}
        {low.has(key) && <span className="label-mono-sm text-warning">{t("lowConfidence")}</span>}
      </Label>
      <Input
        id={`r-${name}`}
        name={name}
        type={type}
        defaultValue={values[key] ?? ""}
        data-low-confidence={low.has(key) || undefined}
        className={cn(low.has(key) && "border-warning ring-1 ring-warning/40")}
      />
    </div>
  );
  return (
    <form action={action} className="flex flex-col gap-4 rounded-md border border-info/40 bg-accent-soft p-5">
      <input type="hidden" name="id" value={id} />
      <div>
        <h2 className="title-md text-foreground">{t("reviewTitle")}</h2>
        <p className="mt-1 text-sm text-body">{t("reviewBody")}</p>
      </div>
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-4 sm:grid-cols-2">
        {field("number", "number", tu("number"))}
        {field("issuer", "issuer", tu("issuer"))}
        {field("issue_date", "issueDate", tu("issueDate"), "date")}
        {field("expiry_date", "expiryDate", tu("expiryDate"), "date")}
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
