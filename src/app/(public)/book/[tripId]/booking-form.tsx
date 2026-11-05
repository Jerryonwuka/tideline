"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ticketPrice, type FeeBearer } from "@/lib/fees";
import { formatMoney, fromJson } from "@/lib/money";

export function BookingForm(props: {
  tripId: string;
  fare: { amount_minor: string; currency: string };
  feeBps: number;
  bearer: FeeBearer;
  maxSeats: number;
  locale: string;
}) {
  const t = useTranslations("booking");
  const te = useTranslations("errors");
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const price = ticketPrice(fromJson(props.fare), Math.max(1, qty || 1), props.feeBps, props.bearer);
  const show = (m: Parameters<typeof formatMoney>[0]) => formatMoney(m, props.locale);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/public/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tripId: props.tripId,
        qty,
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? "") || undefined,
        marketing: form.get("marketing") === "on",
      }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { checkoutUrl?: string; error?: { code: string } } | null;
    if (res?.ok && body?.checkoutUrl) {
      window.location.assign(body.checkoutUrl);
      return;
    }
    setBusy(false);
    const code = body?.error?.code ?? "unknown";
    setError(te.has(code) ? te(code as "unknown") : te("unknown"));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="qty">{t("seats")}</Label>
        <Input
          id="qty"
          type="number"
          min={1}
          max={props.maxSeats}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">{t("phone")}</Label>
        <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" />
      </div>
      <label className="flex items-center gap-2 text-sm text-body">
        <input type="checkbox" name="marketing" />
        {t("marketing")}
      </label>
      <p className="text-xs text-meta" data-testid="booking-privacy">
        {t.rich("privacy", {
          link: (chunks) => (
            <a href="/privacy" className="text-accent hover:underline">
              {chunks}
            </a>
          ),
        })}
      </p>
      <dl className="flex flex-col gap-1 rounded-sm border border-hairline p-3 text-sm">
        {props.bearer === "passenger" ? (
          <div className="flex justify-between text-body">
            <dt>{t("fee")}</dt>
            <dd className="font-mono">{show(price.platformFee)}</dd>
          </div>
        ) : (
          <p className="text-body">{t("feeIncluded")}</p>
        )}
        <div className="flex justify-between text-foreground">
          <dt>{t("total")}</dt>
          <dd className="font-mono" data-testid="booking-total">
            {show(price.total)}
          </dd>
        </div>
      </dl>
      <Button type="submit" disabled={busy || props.maxSeats < 1}>
        {busy ? t("paying") : t("pay", { amount: show(price.total) })}
      </Button>
    </form>
  );
}
