import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { RecordPaymentForm, SendInvoiceForm } from "@/components/charter/contract-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { lineAmount } from "@/lib/invoices";
import { formatMoney, money } from "@/lib/money";
import { uuid } from "@/lib/schemas/common";
import { requireOrgContext } from "@/server/auth/session";
import { signedPdfUrl } from "@/server/services/contracts";

type Line = { description: string; quantity: number; unit_minor: string; kind: "charge" | "discount" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = uuid.safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db, membership } = await requireOrgContext(`/invoices/${parsed.data}`);
  const { data: inv } = await db.from("invoices").select("*").eq("id", parsed.data).maybeSingle();
  if (!inv) notFound();
  const [t, format, locale, pdf] = await Promise.all([
    getTranslations("invoices"),
    getFormatter(),
    getLocale(),
    signedPdfUrl(inv.pdf_path),
  ]);
  const m = (minor: number | string | bigint) => formatMoney(money(BigInt(minor), inv.currency), locale);
  const bill = inv.bill_to as { name?: string; address?: string; phone?: string; email?: string };
  const outstanding = BigInt(inv.total_minor) - BigInt(inv.amount_paid_minor);
  const canManage = inv.org_id === membership.orgId && (membership.role === "owner" || membership.role === "manager");
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={inv.number}
        subtitle={`${bill.name ?? ""} · ${t("detail.issued", { date: date(inv.issue_date) })}${inv.due_date ? ` · ${t("detail.due", { date: date(inv.due_date) })}` : ""}`}
        eyebrow={
          <StatusChip tone="info" className="w-fit" data-testid="invoice-status">
            {t(`status.${inv.status}`)}
          </StatusChip>
        }
      />
      <table className="w-full text-left text-sm">
        <tbody>
          {(inv.line_items as Line[]).map((l, i) => (
            <tr key={i} className="border-b border-hairline">
              <td className="py-2 text-foreground">{l.description}</td>
              <td className="py-2 text-body">
                {l.quantity} × {m(l.unit_minor)}
              </td>
              <td className="py-2 text-right font-mono text-foreground">
                {l.kind === "discount" ? "−" : ""}
                {m(lineAmount(l.quantity, BigInt(l.unit_minor)))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto grid w-full max-w-sm grid-cols-2 gap-1 text-sm" data-testid="invoice-totals">
        <dt className="text-body">{t("detail.subtotal")}</dt>
        <dd className="text-right font-mono">{m(inv.subtotal_minor)}</dd>
        {BigInt(inv.discount_minor) > 0n && (
          <>
            <dt className="text-body">{t("detail.discount")}</dt>
            <dd className="text-right font-mono">−{m(inv.discount_minor)}</dd>
          </>
        )}
        {inv.tax_rate_bps != null && (
          <>
            <dt className="text-body">{t("detail.vat", { rate: inv.tax_rate_bps / 100 })}</dt>
            <dd className="text-right font-mono" data-testid="invoice-vat">
              {m(inv.tax_minor)}
            </dd>
          </>
        )}
        <dt className="font-medium text-foreground">{t("detail.total")}</dt>
        <dd className="text-right font-mono text-foreground" data-testid="invoice-total">
          {m(inv.total_minor)}
        </dd>
        <dt className="text-body">{t("detail.paid")}</dt>
        <dd className="text-right font-mono">{m(inv.amount_paid_minor)}</dd>
        <dt className="text-body">{t("detail.outstanding")}</dt>
        <dd className="text-right font-mono" data-testid="invoice-outstanding">
          {m(outstanding)}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-4">
        {pdf && (
          <a href={pdf} className="label-mono-sm text-accent hover:underline" data-testid="invoice-pdf">
            {t("detail.pdf")}
          </a>
        )}
        {inv.status !== "draft" && (
          <a href={`/i/${inv.public_token}`} className="label-mono-sm text-accent hover:underline">
            {t("detail.publicLink")}
          </a>
        )}
      </div>
      {canManage && inv.status !== "void" && (
        <SendInvoiceForm invoiceId={inv.id} phone={bill.phone} email={bill.email} />
      )}
      {canManage && inv.status !== "draft" && inv.status !== "void" && outstanding > 0n && (
        <RecordPaymentForm invoiceId={inv.id} />
      )}
    </div>
  );
}
