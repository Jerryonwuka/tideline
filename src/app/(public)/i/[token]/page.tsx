import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { lineAmount } from "@/lib/invoices";
import { formatMoney, money } from "@/lib/money";
import { invoiceByToken, startInvoiceCheckout } from "@/server/services/invoices";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("invoices"))("title"), robots: { index: false } };
}

type Line = { description: string; quantity: number; unit_minor: string; kind: "charge" | "discount" };

/** The client's invoice page (no login): what's owed, and Pay online. */
export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await invoiceByToken(token);
  const [t, locale] = await Promise.all([getTranslations("invoices"), getLocale()]);
  if (!inv) redirect("/");
  const m = (minor: number | string | bigint) => formatMoney(money(BigInt(minor), inv.currency), locale);
  const outstanding = BigInt(inv.total_minor) - BigInt(inv.amount_paid_minor);
  async function pay() {
    "use server";
    redirect(await startInvoiceCheckout(token));
  }
  return (
    <AuthShell>
      <h1 className="heading text-foreground">{t("public.title", { number: inv.number })}</h1>
      <p className="text-body">{t("public.from", { org: inv.org?.name ?? "" })}</p>
      <ul className="mt-4 flex flex-col gap-1 text-sm">
        {(inv.line_items as Line[]).map((l, i) => (
          <li key={i} className="flex justify-between gap-2 text-foreground">
            <span>{l.description}</span>
            <span className="font-mono">
              {l.kind === "discount" ? "−" : ""}
              {m(lineAmount(l.quantity, BigInt(l.unit_minor)))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex justify-between font-mono text-lg text-foreground">
        <span>{t("detail.total")}</span>
        <span>{m(inv.total_minor)}</span>
      </p>
      {inv.status === "void" ? (
        <p className="mt-4 text-body">{t("public.void")}</p>
      ) : outstanding <= 0n ? (
        <p className="mt-4 text-foreground" data-testid="invoice-paid">
          {t("public.paid")}
        </p>
      ) : (
        <form action={pay} className="mt-6">
          <Button type="submit">{t("public.pay", { amount: m(outstanding) })}</Button>
        </form>
      )}
    </AuthShell>
  );
}
