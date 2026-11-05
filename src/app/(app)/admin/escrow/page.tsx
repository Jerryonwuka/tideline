import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney, money } from "@/lib/money";
import { requireAdmin } from "@/server/admin-console";

export default async function AdminEscrowPage() {
  const { db } = await requireAdmin("/admin/escrow");
  const [t, format, locale, { data }] = await Promise.all([
    getTranslations("console.escrow"),
    getFormatter(),
    getLocale(),
    db
      .from("escrow_holds")
      .select("id, currency, amount_minor, released_minor, refunded_minor, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const m = (v: number | string, c: string) => formatMoney(money(BigInt(v), c), locale);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {!data?.length ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline">
          {data.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3 text-sm last:border-b-0"
            >
              <span className="flex flex-col">
                <span className="font-mono text-foreground">
                  {t("held", {
                    amount: m(h.amount_minor, h.currency),
                    released: m(h.released_minor, h.currency),
                    refunded: m(h.refunded_minor, h.currency),
                  })}
                </span>
                <span className="text-meta">{format.dateTime(new Date(h.created_at), { dateStyle: "medium" })}</span>
              </span>
              <StatusChip tone={h.status === "disputed" ? "danger" : h.status === "released" ? "success" : "info"}>
                {t(`status.${h.status}`)}
              </StatusChip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
