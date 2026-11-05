"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  decideQuoteAction,
  saveListingAction,
  sendQuoteAction,
  type CharterState,
} from "@/app/(app)/(org)/charter-actions";

type Option = { id: string; label: string };
type Doc = { id: string; label: string; subject: string };

export function ListingForm({
  vessels,
  documents,
  currency,
}: {
  vessels: Option[];
  documents: Doc[];
  currency: string;
}) {
  const t = useTranslations("charter.listings");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<CharterState, FormData>(saveListingAction, {});
  const [vessel, setVessel] = useState(vessels[0]?.id ?? "");
  const docs = documents.filter((d) => d.subject === vessel || d.subject === "org");
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error ? te(state.error) : null} />
      {state.ok && (
        <p className="text-sm text-foreground" role="status">
          {t("saved")}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="vesselId">{t("fields.vessel")}</Label>
          <NativeSelect id="vesselId" name="vesselId" value={vessel} onChange={(e) => setVessel(e.target.value)}>
            {vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dayRate">{t("fields.dayRate", { currency })}</Label>
          <Input id="dayRate" name="dayRate" inputMode="decimal" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="minRate">{t("fields.minRate")}</Label>
          <Input id="minRate" name="minRate" inputMode="decimal" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="minDays">{t("fields.minDays")}</Label>
          <Input id="minDays" name="minDays" type="number" min={1} defaultValue={1} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="operatingArea">{t("fields.area")}</Label>
          <Input id="operatingArea" name="operatingArea" required minLength={2} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="status">{t("fields.status")}</Label>
          <NativeSelect id="status" name="status" defaultValue="live">
            {(["live", "draft", "paused"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="availableFrom">{t("fields.from")}</Label>
          <Input id="availableFrom" name="availableFrom" type="date" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="availableTo">{t("fields.to")}</Label>
          <Input id="availableTo" name="availableTo" type="date" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{t("fields.description")}</Label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          className="rounded-xs border border-hairline-strong bg-surface-sunken p-3 text-sm text-foreground"
        />
      </div>
      {docs.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 label-mono-sm text-meta">{t("fields.documents")}</legend>
          {docs.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" name="publicDocumentIds" value={d.id} />
              {d.label}
            </label>
          ))}
        </fieldset>
      )}
      <Button type="submit" disabled={pending} className="w-fit">
        {t("fields.save")}
      </Button>
    </form>
  );
}

export function QuoteForm({
  requestId,
  vessels,
  currency,
  defaultUntil,
}: {
  requestId: string;
  vessels: Option[];
  currency: string;
  defaultUntil: string;
}) {
  const t = useTranslations("charter.requests");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<CharterState, FormData>(sendQuoteAction, {});
  if (state.ok) return null;
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-sm border border-hairline p-4"
      aria-label={t("quoteTitle")}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <span className="label-mono-sm text-meta">{t("quoteTitle")}</span>
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`v-${requestId}`}>{t("fields.vessel")}</Label>
          <NativeSelect id={`v-${requestId}`} name="vesselId">
            {vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`r-${requestId}`}>{t("fields.dayRate", { currency })}</Label>
          <Input id={`r-${requestId}`} name="dayRate" inputMode="decimal" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`m-${requestId}`}>{t("fields.mobilisation")}</Label>
          <Input id={`m-${requestId}`} name="mobilisation" inputMode="decimal" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`f-${requestId}`}>{t("fields.fuel")}</Label>
          <Input id={`f-${requestId}`} name="fuelTerms" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`p-${requestId}`}>{t("fields.payment")}</Label>
          <Input id={`p-${requestId}`} name="paymentTerms" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`u-${requestId}`}>{t("fields.validUntil")}</Label>
          <Input id={`u-${requestId}`} name="validUntil" type="date" defaultValue={defaultUntil} required />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("fields.send")}
      </Button>
    </form>
  );
}

export function QuoteDecision({ quoteId }: { quoteId: string }) {
  const t = useTranslations("charter.requests");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<CharterState, FormData>(decideQuoteAction, {});
  if (state.ok) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="quoteId" value={quoteId} />
      <Button type="submit" name="decision" value="accept" size="sm" disabled={pending}>
        {t("accept")}
      </Button>
      <Button type="submit" name="decision" value="decline" size="sm" variant="ghost" disabled={pending}>
        {t("decline")}
      </Button>
      {state.error && <span className="text-sm text-danger">{te(state.error)}</span>}
    </form>
  );
}
