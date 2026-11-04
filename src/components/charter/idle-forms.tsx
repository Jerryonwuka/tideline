"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { outreachAction, publishAction, type IdleState } from "@/app/(app)/(org)/idle-actions";

const textarea =
  "rounded-xs border border-hairline-strong bg-surface-sunken p-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none";

export function PublishSuggestionForm({
  vesselId,
  currency,
  rate,
  area,
  description,
}: {
  vesselId: string;
  currency: string;
  rate: string;
  area: string;
  description: string;
}) {
  const t = useTranslations("idle");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<IdleState, FormData>(publishAction, {});
  if (state.ok)
    return (
      <p className="flex items-center gap-3 text-sm text-foreground" data-testid="idle-published">
        {t("published")}
        <Link href={`/board/${state.listingId}`} className="text-accent hover:underline">
          {t("viewListing")}
        </Link>
      </p>
    );
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="vesselId" value={vesselId} />
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`rate-${vesselId}`}>{t("dayRate", { currency })}</Label>
          <Input id={`rate-${vesselId}`} name="dayRate" inputMode="decimal" defaultValue={rate} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`area-${vesselId}`}>{t("area")}</Label>
          <Input id={`area-${vesselId}`} name="area" defaultValue={area} required minLength={2} maxLength={120} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`desc-${vesselId}`}>{t("description")}</Label>
        <textarea
          id={`desc-${vesselId}`}
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={description}
          className={textarea}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("publish")}
      </Button>
    </form>
  );
}

export function OutreachButton({ vesselId, buyerOrgId }: { vesselId: string; buyerOrgId: string }) {
  const t = useTranslations("idle");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<IdleState, FormData>(outreachAction, {});
  const [copied, setCopied] = useState(false);
  if (state.text)
    return (
      <div className="flex w-full flex-col gap-2" data-testid="idle-outreach">
        <textarea readOnly rows={3} value={state.text} className={textarea} aria-label={t("draftMessage")} />
        <span className="flex items-center gap-3 text-sm text-meta">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(state.text!).then(() => setCopied(true));
            }}
          >
            {t("copy")}
          </Button>
          {copied ? t("copied") : t("messageNote")}
        </span>
      </div>
    );
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="vesselId" value={vesselId} />
      <input type="hidden" name="buyerOrgId" value={buyerOrgId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {t("draftMessage")}
      </Button>
      {state.error && <span className="text-sm text-danger">{te(state.error)}</span>}
    </form>
  );
}
