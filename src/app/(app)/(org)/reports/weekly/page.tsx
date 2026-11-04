import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { localDate } from "@/lib/dates";
import { formatMoney, type Money } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { weekStart, weeklyReport } from "@/server/services/dashboard";

export default async function WeeklyReportPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { db, membership } = await requireOrgContext("/reports/weekly");
  const org = await orgBasics(db, membership.orgId);
  const requested = (await searchParams).week;
  const from = weekStart(
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : localDate(new Date(), org.time_zone),
  );
  const [t, format, report, incidents] = await Promise.all([
    getTranslations("ferry.weekly"),
    getFormatter(),
    weeklyReport(db, { id: membership.orgId, time_zone: org.time_zone, currency: org.currency }, from),
    db
      .from("incidents")
      .select("id, description, status, urgent, created_at, vessel:vessels(name)")
      .eq("org_id", membership.orgId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const fmt = (m: Money) => formatMoney(m, org.default_locale);
  const csv = `/api/v1/reports/export.csv?org_id=${membership.orgId}&from=${report.from}&to=${report.to}`;
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const th = "px-4 py-3 font-medium";
  const td = "px-4 py-3 text-body";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <form className="flex items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="label-mono-sm text-meta">{t("week")}</span>
                <Input type="date" name="week" defaultValue={from} className="h-10 w-44" />
              </label>
              <button
                type="submit"
                className="h-10 rounded-xs border border-hairline-strong px-3 text-sm text-body hover:text-foreground"
              >
                →
              </button>
            </form>
            <a href={csv} className="h-10 content-center label-mono-sm text-accent hover:underline">
              {t("export")}
            </a>
          </div>
        }
      />

      <dl className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-3">
        {(
          [
            [
              "takings",
              fmt({
                amountMinor: report.totals.cash.amountMinor + report.totals.digital.amountMinor,
                currency: org.currency,
              }),
            ],
            ["expenses", fmt(report.totals.expenses)],
            ["net", fmt(report.totals.net)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 panel p-5">
            <dt className="label-mono-sm text-meta">{t(`totals.${k}`)}</dt>
            <dd className="font-mono text-2xl text-foreground" data-testid={`week-${k}`}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="title-md text-foreground">{t("daysTitle")}</h2>
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline label-mono-sm text-meta">
                {(["date", "trips", "passengers", "cash", "digital"] as const).map((c) => (
                  <th key={c} className={th}>
                    {t(`columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.days.map((d) => (
                <tr key={d.date} className="border-b border-hairline last:border-b-0">
                  <td className="px-4 py-3 text-foreground">
                    <Link href={`/reports/daily?date=${d.date}`} className="hover:text-accent">
                      {day(d.date)}
                    </Link>
                  </td>
                  <td className={td}>{d.trips}</td>
                  <td className={td}>{d.passengers}</td>
                  <td className={`${td} font-mono text-xs`}>{fmt(d.cash)}</td>
                  <td className={`${td} font-mono text-xs`}>{fmt(d.digital)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.vessels.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="title-md text-foreground">{t("vesselsTitle")}</h2>
          <ul className="rounded-md border border-hairline">
            {report.vessels.map((v) => (
              <li
                key={v.vesselId}
                className="flex flex-wrap justify-between gap-2 border-b border-hairline px-4 py-3 text-sm last:border-b-0"
              >
                <span className="text-foreground">{v.vesselName}</span>
                <span className="text-body">
                  {v.trips} {t("columns.trips").toLowerCase()} · {v.passengers} {t("columns.passengers").toLowerCase()}{" "}
                  ·{" "}
                  <span className="font-mono">
                    {fmt({ amountMinor: v.cash.amountMinor + v.digital.amountMinor, currency: org.currency })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="title-md text-foreground">{t("expensesTitle")}</h2>
        {report.expenses.length === 0 ? (
          <p className="text-sm text-body">{t("noExpenses")}</p>
        ) : (
          <ul className="rounded-md border border-hairline">
            {report.expenses.map((e) => (
              <li
                key={e.category}
                className="flex justify-between border-b border-hairline px-4 py-3 text-sm last:border-b-0"
              >
                <span className="text-foreground">
                  {t.has(`categories.${e.category}`) ? t(`categories.${e.category}` as "categories.other") : e.category}
                </span>
                <span className="font-mono text-body">{fmt(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" id="incidents">
        <h2 className="title-md text-foreground">{t("incidentsTitle")}</h2>
        {!incidents.data?.length ? (
          <p className="text-sm text-body">{t("noIncidents")}</p>
        ) : (
          <ul className="rounded-md border border-hairline">
            {incidents.data.map((i) => (
              <li key={i.id} className="flex flex-col gap-1 border-b border-hairline px-4 py-3 text-sm last:border-b-0">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-foreground">
                    {format.dateTime(new Date(i.created_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: org.time_zone,
                    })}
                    {i.vessel?.name ? ` · ${i.vessel.name}` : ""}
                  </span>
                  <StatusChip tone={i.status === "open" ? (i.urgent ? "danger" : "warning") : "neutral"}>
                    {t(`incidentStatus.${i.status}`)}
                  </StatusChip>
                </span>
                <span className="text-body">{i.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
