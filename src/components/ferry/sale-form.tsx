"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { agentSaleAction, type SaleState } from "@/app/(app)/(org)/billing-actions";

/** Agent sale at the jetty: cash or transfer recorded, passenger added to the manifest. */
export function SaleForm({ tripId }: { tripId: string }) {
  const t = useTranslations("sales");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<SaleState, FormData>(agentSaleAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" key={state.code ?? "new"}>
      <input type="hidden" name="tripId" value={tripId} />
      <FormError message={state.error ? te(state.error) : null} />
      {state.code && (
        <p className="text-sm text-foreground" role="status">
          {t("sold", { code: state.code })}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="sale-name">{t("name")}</Label>
          <Input id="sale-name" name="name" required minLength={2} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sale-phone">{t("phone")}</Label>
          <Input id="sale-phone" name="phone" type="tel" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sale-qty">{t("seats")}</Label>
          <Input id="sale-qty" name="qty" type="number" min={1} max={20} defaultValue={1} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sale-method">{t("method")}</Label>
          <NativeSelect id="sale-method" name="method" defaultValue="cash">
            <option value="cash">{t("cash")}</option>
            <option value="transfer">{t("transfer")}</option>
          </NativeSelect>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("sell")}
      </Button>
    </form>
  );
}
