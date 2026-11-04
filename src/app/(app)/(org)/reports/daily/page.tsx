import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { Input } from "@/components/ui/input";
import { addDays, localDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { dailyReport } from "@/server/services/ferry";

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { db, membership } = await requireOrgContext("/reports/daily");
  const org = await orgBasics(db, membership.orgId);
  const today = localDate(new Date(), org.time_zone);
  const requested = (await searchParams).date;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const [t, report] = await Promise.all([
    getTranslations("ferry.report"),
    dailyReport(db, membership.orgId, date, org.time_zone, org.currency),
  ]);
  const fmt = (m: Parameters<typeof formatMoney>[0]) => formatMoney(m, org.default_locale);
  const csv = `/api/v1/reports/export.csv?org_id=${membership.orgId}&from=${addDays(today, -30)}&to=${today}`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <form className="flex items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="label-mono-sm text-meta">{t("date")}</span>
                <Input type="date" name="date" defaultValue={date} className="h-10 w-44" />
              </label>
              <button
                type="submit"
                className="h-10 rounded-xs border border-hairline-strong px-3 text-sm text-body hover:text-foreground"
              >
                →
              </button>
            </form>
            <a href={csv} className="h-10 content-center label-mono-sm text-accent hover:underline">
              {t("exportRange")}
            </a>
            <a
              href={`/reports/weekly?week=${date}`}
              className="h-10 content-center label-mono-sm text-accent hover:underline"
            >
              {t("weekly")}
            </a>
          </div>
        }
      />
      {report.rows.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline label-mono-sm text-meta">
                {(["vessel", "trips", "passengers", "cash", "digital"] as const).map((c) => (
                  <th key={c} className="px-4 py-3 font-medium">
                    {t(`columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.vesselId} className="border-b border-hairline">
                  <td className="px-4 py-3 text-foreground">{r.vesselName}</td>
                  <td className="px-4 py-3 text-body">{r.trips}</td>
                  <td className="px-4 py-3 text-body">{r.passengers}</td>
                  <td className="px-4 py-3 font-mono text-xs text-body">{fmt(r.cash)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-body">{fmt(r.digital)}</td>
                </tr>
              ))}
              <tr className="bg-surface font-medium">
                <td className="px-4 py-3 text-foreground">{t("total")}</td>
                <td className="px-4 py-3 text-foreground">{report.totals.trips}</td>
                <td className="px-4 py-3 text-foreground" data-testid="total-passengers">
                  {report.totals.passengers}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-foreground" data-testid="total-cash">
                  {fmt(report.totals.cash)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{fmt(report.totals.digital)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
