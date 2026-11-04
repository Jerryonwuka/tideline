import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney, money } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";

const TONE = {
  draft: "neutral",
  sent: "info",
  part_paid: "warning",
  paid: "success",
  overdue: "danger",
  void: "neutral",
} as const;

export default async function InvoicesPage() {
  const { db, membership } = await requireOrgContext("/invoices");
  const [t, format, locale, { data }] = await Promise.all([
    getTranslations("invoices"),
    getFormatter(),
    getLocale(),
    db
      .from("invoices")
      .select("id, number, bill_to, currency, total_minor, due_date, status")
      .eq("org_id", membership.orgId)
      .order("created_at", { ascending: false }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Link href="/invoices/new" className="label-mono-sm text-accent hover:underline">
            {t("new")}
          </Link>
        }
      />
      {!data?.length ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline">
          {data.map((i) => (
            <li key={i.id} className="border-b border-hairline last:border-b-0">
              <Link
                href={`/invoices/${i.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface"
              >
                <span className="flex flex-col">
                  <span className="font-mono text-foreground">{i.number}</span>
                  <span className="text-sm text-body">{(i.bill_to as { name?: string }).name}</span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-foreground">
                    {formatMoney(money(BigInt(i.total_minor), i.currency), locale)}
                  </span>
                  {i.due_date && (
                    <span className="text-meta">
                      {format.dateTime(new Date(`${i.due_date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}
                    </span>
                  )}
                  <StatusChip tone={TONE[i.status]}>{t(`status.${i.status}`)}</StatusChip>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
