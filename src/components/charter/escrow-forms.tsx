"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  addBankAccountAction,
  disputeAction,
  hireAction,
  payEscrowAction,
  releaseEarlyAction,
  type EscrowState,
} from "@/app/(app)/(org)/escrow-actions";

function useAction(fn: (s: EscrowState, f: FormData) => Promise<EscrowState>) {
  return useActionState<EscrowState, FormData>(fn, {});
}

export function PayEscrowButton({ charterId, label }: { charterId: string; label: string }) {
  const te = useTranslations("errors");
  const [state, action, pending] = useAction(payEscrowAction);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="charterId" value={charterId} />
      <FormError message={state.error ? te(state.error) : null} />
      <Button type="submit" disabled={pending} className="w-fit">
        {label}
      </Button>
    </form>
  );
}

export function HireButton({ charterId, stage, label }: { charterId: string; stage: "on" | "off"; label: string }) {
  const te = useTranslations("errors");
  const [state, action, pending] = useAction(hireAction);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="charterId" value={charterId} />
      <input type="hidden" name="stage" value={stage} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {label}
      </Button>
      {state.error && <span className="text-sm text-danger">{te(state.error)}</span>}
    </form>
  );
}

export function ReleaseEarlyButton({ charterId, holdId }: { charterId: string; holdId: string }) {
  const t = useTranslations("escrow");
  const te = useTranslations("errors");
  const [state, action, pending] = useAction(releaseEarlyAction);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="charterId" value={charterId} />
      <input type="hidden" name="holdId" value={holdId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {t("release")}
      </Button>
      {state.error && <span className="text-sm text-danger">{te(state.error)}</span>}
    </form>
  );
}

export function DisputeForm({ charterId, holdId }: { charterId: string; holdId: string }) {
  const t = useTranslations("escrow");
  const te = useTranslations("errors");
  const [state, action, pending] = useAction(disputeAction);
  if (state.ok) return <p className="text-sm text-foreground">{t("disputeSent")}</p>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="charterId" value={charterId} />
      <input type="hidden" name="holdId" value={holdId} />
      <FormError message={state.error ? te(state.error) : null} />
      <Label htmlFor="dispute-reason">{t("disputeReason")}</Label>
      <Input id="dispute-reason" name="reason" required minLength={5} />
      <Button type="submit" variant="danger" disabled={pending} className="w-fit">
        {t("dispute")}
      </Button>
    </form>
  );
}

export function BankAccountForm() {
  const t = useTranslations("payouts");
  const te = useTranslations("errors");
  const [state, action, pending] = useAction(addBankAccountAction);
  return (
    <form action={action} className="flex flex-col gap-3" key={state.ok ? "done" : "form"}>
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="bankCode">{t("fields.bankCode")}</Label>
          <Input id="bankCode" name="bankCode" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="accountNumber">{t("fields.accountNumber")}</Label>
          <Input id="accountNumber" name="accountNumber" inputMode="numeric" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="accountName">{t("fields.accountName")}</Label>
          <Input id="accountName" name="accountName" required />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("fields.save")}
      </Button>
    </form>
  );
}
