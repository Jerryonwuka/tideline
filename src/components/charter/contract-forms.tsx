"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  acceptContractAction,
  createInvoiceAction,
  generateContractAction,
  recordCharterAction,
  recordPaymentAction,
  sendInvoiceAction,
  type ContractState,
} from "@/app/(app)/(org)/contract-actions";

type Option = { id: string; label: string };

export function GenerateContractForm({
  charterId,
  templates,
  label,
}: {
  charterId: string;
  templates: Option[];
  label: string;
}) {
  const t = useTranslations("contracts");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<ContractState, FormData>(generateContractAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="charterId" value={charterId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="templateId">{t("template")}</Label>
        <NativeSelect id="templateId" name="templateId">
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
      <FormError message={state.error ? te(state.error) : null} />
    </form>
  );
}

export function AcceptContractForm({ charterId, contractId }: { charterId: string; contractId: string }) {
  const t = useTranslations("contracts");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<ContractState, FormData>(acceptContractAction, {});
  if (state.ok) return null;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-sm border border-hairline-strong p-4">
      <input type="hidden" name="charterId" value={charterId} />
      <input type="hidden" name="contractId" value={contractId} />
      <span className="title-md text-foreground">{t("acceptTitle")}</span>
      <p className="text-sm text-body">{t("acceptHint")}</p>
      <FormError message={state.error ? te(state.error) : null} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="acceptName">{t("name")}</Label>
        <Input id="acceptName" name="name" required minLength={2} maxLength={120} autoComplete="name" />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("accept")}
      </Button>
    </form>
  );
}

export function RecordCharterForm({ vessels, currency }: { vessels: Option[]; currency: string }) {
  const t = useTranslations("charter.charters");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<ContractState, FormData>(recordCharterAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-vessel">{t("fields.vessel")}</Label>
          <NativeSelect id="rc-vessel" name="vesselId">
            {vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-client">{t("fields.client")}</Label>
          <Input id="rc-client" name="clientName" required minLength={2} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-rate">{t("fields.dayRate", { currency })}</Label>
          <Input id="rc-rate" name="dayRate" inputMode="decimal" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-from">{t("fields.from")}</Label>
          <Input id="rc-from" name="startDate" type="date" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-to">{t("fields.to")}</Label>
          <Input id="rc-to" name="endDate" type="date" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-mob">{t("fields.mobilisation")}</Label>
          <Input id="rc-mob" name="mobilisation" inputMode="decimal" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("fields.save")}
      </Button>
    </form>
  );
}

export function InvoiceForm({
  currency,
  vatRate,
  vatDefault,
}: {
  currency: string;
  vatRate: number | null;
  vatDefault: boolean;
}) {
  const t = useTranslations("invoices.fields");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<ContractState, FormData>(createInvoiceAction, {});
  const [rows, setRows] = useState(1);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="billTo">{t("billTo")}</Label>
          <Input id="billTo" name="billTo" required minLength={2} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="address">{t("address")}</Label>
          <Input id="address" name="address" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_9rem_8rem] gap-2" data-testid="invoice-line">
          <Input name="description" aria-label={t("description")} placeholder={t("description")} required={i === 0} />
          <Input name="quantity" aria-label={t("quantity")} inputMode="decimal" defaultValue="1" />
          <Input
            name="unitPrice"
            aria-label={t("unitPrice", { currency })}
            placeholder={t("unitPrice", { currency })}
            inputMode="decimal"
          />
          <NativeSelect name="kind" aria-label={t("discount")} defaultValue="charge">
            <option value="charge">+</option>
            <option value="discount">{t("discount")}</option>
          </NativeSelect>
        </div>
      ))}
      <button type="button" onClick={() => setRows((r) => r + 1)} className="w-fit text-sm text-accent hover:underline">
        {t("addLine")}
      </button>
      {vatRate != null ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="addVat" defaultChecked={vatDefault} />
          {t("addVat", { rate: vatRate / 100 })}
        </label>
      ) : (
        <p className="text-xs text-meta">{t("noVat")}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="dueDate">{t("dueDate")}</Label>
          <Input id="dueDate" name="dueDate" type="date" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">{t("notes")}</Label>
          <Input id="notes" name="notes" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("create")}
      </Button>
    </form>
  );
}

export function SendInvoiceForm({ invoiceId, phone, email }: { invoiceId: string; phone?: string; email?: string }) {
  const t = useTranslations("invoices.detail");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<ContractState, FormData>(sendInvoiceAction, {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-sm border border-hairline p-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <span className="label-mono-sm text-meta">{t("sendTitle")}</span>
      <FormError message={state.error ? te(state.error) : null} />
      {state.ok && (
        <p className="text-sm text-foreground" role="status">
          {t("sent")}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="send-wa">{t("whatsapp")}</Label>
          <Input id="send-wa" name="whatsapp" type="tel" defaultValue={phone} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="send-email">{t("email")}</Label>
          <Input id="send-email" name="email" type="email" defaultValue={email} />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("send")}
      </Button>
    </form>
  );
}

export function RecordPaymentForm({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("invoices.detail");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<ContractState, FormData>(recordPaymentAction, {});
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-sm border border-hairline p-4"
      key={state.ok ? "done" : "form"}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <span className="label-mono-sm text-meta">{t("recordTitle")}</span>
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pay-amount">{t("amount")}</Label>
          <Input id="pay-amount" name="amount" inputMode="decimal" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pay-method">{t("method")}</Label>
          <NativeSelect id="pay-method" name="method" defaultValue="transfer">
            <option value="transfer">{t("transfer")}</option>
            <option value="cash">{t("cash")}</option>
          </NativeSelect>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("record")}
      </Button>
    </form>
  );
}
