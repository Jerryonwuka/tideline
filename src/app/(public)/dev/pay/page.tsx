import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { formatMoney, money } from "@/lib/money";
import { devToolsEnabled } from "@/server/env";
import { supabaseAdmin } from "@/server/supabase/admin";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { completeFakePayment } from "@/server/dev/fake-payments";

export const dynamic = "force-dynamic";

/** Local-only stand-in for a provider's hosted checkout (fake payments). 404 elsewhere. */
export default async function DevPayPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; return?: string }>;
}) {
  if (!devToolsEnabled()) notFound();
  const { reference, return: back } = await searchParams;
  if (!reference || !back) notFound();
  const { data: payment } = await supabaseAdmin()
    .from("payments")
    .select("amount_minor, currency")
    .eq("provider_ref", reference)
    .maybeSingle();
  if (!payment) notFound();
  const [t, locale] = await Promise.all([getTranslations("devPay"), getLocale()]);
  // Only send people back to this app.
  const returnTo = new URL(back).pathname + new URL(back).search;
  return (
    <AuthShell>
      <h1 className="heading text-foreground">{t("title")}</h1>
      <p className="text-body">{t("note")}</p>
      <p className="my-6 font-mono text-3xl text-foreground">
        {formatMoney(money(payment.amount_minor, payment.currency), locale)}
      </p>
      {/* Plain forms: works before (or without) client JavaScript. */}
      <div className="flex gap-3">
        {(["success", "failed"] as const).map((outcome) => (
          <form
            key={outcome}
            action={async () => {
              "use server";
              await completeFakePayment(reference, outcome);
              redirect(returnTo);
            }}
          >
            <Button type="submit" variant={outcome === "success" ? "primary" : "ghost"}>
              {outcome === "success" ? t("pay") : t("decline")}
            </Button>
          </form>
        ))}
      </div>
    </AuthShell>
  );
}
