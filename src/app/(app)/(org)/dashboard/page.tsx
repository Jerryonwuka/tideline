import { FileText, Ship, Users } from "lucide-react";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/money";
import { orgBasics } from "@/server/org-context";
import { dashboardSummary, IDLE_DAYS } from "@/server/services/dashboard";
import { ScoreBar } from "@/components/fleet/status";
import { BracketIcon } from "@/components/marketing/brackets";
import { StatusChip } from "@/components/ui/chip";
import { requireOrgContext } from "@/server/auth/session";
import { fleetCompliance } from "@/server/compliance/vessels";
import { listDocuments } from "@/server/services/documents";
import { getOrg } from "@/server/services/orgs";
import { listVessels } from "@/server/services/vessels";

export default async function DashboardPage() {
  const { db, me, membership } = await requireOrgContext("/dashboard");
  const canManage = membership.role === "owner" || membership.role === "manager";
  const [t, tRoles, org, vessels, docs] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("roles"),
    getOrg(db, membership.orgId),
    listVessels(db, membership.orgId),
    canManage ? listDocuments(db, { orgId: membership.orgId }) : Promise.resolve([]),
  ]);
  const [scores, basics, format, locale] = await Promise.all([
    fleetCompliance(db, membership.orgId, vessels),
    orgBasics(db, membership.orgId),
    getFormatter(),
    getLocale(),
  ]);
  const summary = canManage
    ? await dashboardSummary(db, { id: membership.orgId, time_zone: basics.time_zone, currency: basics.currency })
    : null;
  const ALERT_LINKS = {
    pendingOverrides: "/safety",
    openIncidents: "/reports/weekly#incidents",
    expiredDocuments: "/documents?status=expired",
    expiringDocuments: "/documents?status=expiring",
    needsReview: "/documents?status=needs_review",
  } as const;
  const alerts = summary
    ? (Object.keys(ALERT_LINKS) as (keyof typeof ALERT_LINKS)[]).filter((k) => summary.alerts[k] > 0)
    : [];
  const count = (s: string) => docs.filter((d) => d.effective_status === s).length;
  const attention = (["expired", "expiring", "needs_review"] as const)
    .map((s) => ({ status: s, n: count(s) }))
    .filter((x) => x.n > 0);
  const tone =
    org.verification_status === "verified" ? "success" : org.verification_status === "pending" ? "info" : "neutral";

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3 border-b border-hairline pb-8">
        <StatusChip tone={tone} className="w-fit">
          {t(`verification.${org.verification_status}`)}
        </StatusChip>
        <h1 className="display-sm text-foreground">{t("title", { name: me.fullName ?? "" })}</h1>
        <p className="body-lg text-body">{t("subtitle", { org: org.name, role: tRoles(membership.role) })}</p>
      </header>

      {summary && (
        <section aria-labelledby="today" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 id="today" className="title-md text-foreground">
              {t("todayTitle")}
            </h2>
            <Link href="/reports/daily" className="label-mono-sm text-accent hover:underline">
              {t("reports")}
            </Link>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-4">
            {(
              [
                ["trips", String(summary.trips.total)],
                ["passengers", String(summary.passengers)],
                ["cash", formatMoney(summary.takings.cash, locale)],
                ["digital", formatMoney(summary.takings.digital, locale)],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-1 panel p-5">
                <dt className="label-mono-sm text-meta">{t(`figures.${key}`)}</dt>
                <dd className="font-mono text-2xl text-foreground" data-testid={`dash-${key}`}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-body">
            {t("tripBreakdown", {
              departed: summary.trips.departed,
              arrived: summary.trips.arrived,
              waiting: summary.trips.scheduled + summary.trips.boarding,
            })}
          </p>
        </section>
      )}

      {summary && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="alerts" className="rounded-md border border-hairline">
            <h2 id="alerts" className="border-b border-hairline px-5 py-4 title-md text-foreground">
              {t("alertsTitle")}
            </h2>
            {alerts.length === 0 ? (
              <p className="px-5 py-6 text-sm text-meta">{t("allClear")}</p>
            ) : (
              <ul data-testid="dash-alerts">
                {alerts.map((k) => (
                  <li key={k} className="border-b border-hairline last:border-b-0">
                    <Link href={ALERT_LINKS[k]} className="block px-5 py-3 text-sm text-foreground hover:bg-surface">
                      {t(`alerts.${k}`, { count: summary.alerts[k] })}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="idle" className="rounded-md border border-hairline">
            <div className="border-b border-hairline px-5 py-4">
              <h2 id="idle" className="title-md text-foreground">
                {t("idleTitle")}
              </h2>
              <p className="text-xs text-meta">{t("idleHint", { days: IDLE_DAYS })}</p>
            </div>
            {summary.idleVessels.length === 0 ? (
              <p className="px-5 py-6 text-sm text-meta">{t("idleNone")}</p>
            ) : (
              <ul data-testid="dash-idle">
                {summary.idleVessels.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between border-b border-hairline px-5 py-3 text-sm last:border-b-0"
                  >
                    <Link href={`/vessels/${v.id}`} className="text-foreground hover:text-accent">
                      {v.name}
                    </Link>
                    <span className="text-meta">
                      {v.lastTripAt
                        ? t("lastTrip", {
                            date: format.dateTime(new Date(v.lastTripAt), {
                              dateStyle: "medium",
                              timeZone: basics.time_zone,
                            }),
                          })
                        : t("neverSailed")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="fleet" className="rounded-md border border-hairline">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2 id="fleet" className="title-md text-foreground">
              {t("fleetTitle")}
            </h2>
            <Link href="/vessels" className="label-mono-sm text-accent hover:underline">
              {t("viewAll")}
            </Link>
          </div>
          {scores.length === 0 ? (
            <p className="px-5 py-6 text-sm text-meta">{t("noVessels")}</p>
          ) : (
            <ul>
              {scores.map((s) => (
                <li
                  key={s.vesselId}
                  className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-4 border-b border-hairline px-5 py-3 last:border-b-0"
                >
                  <Link href={`/vessels/${s.vesselId}`} className="truncate text-sm text-foreground hover:text-accent">
                    {s.name}
                  </Link>
                  <ScoreBar score={s.score.score} label={s.name} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage && (
          <section aria-labelledby="attention" className="rounded-md border border-hairline">
            <h2 id="attention" className="border-b border-hairline px-5 py-4 title-md text-foreground">
              {t("needsAttention")}
            </h2>
            {attention.length === 0 ? (
              <p className="px-5 py-6 text-sm text-meta">{t("allClear")}</p>
            ) : (
              <ul>
                {attention.map((a) => (
                  <li key={a.status} className="border-b border-hairline last:border-b-0">
                    <Link
                      href={`/documents?status=${a.status}`}
                      className="flex items-center justify-between px-5 py-3 text-sm hover:bg-surface"
                    >
                      <span className="text-foreground">{t(`counts.${a.status}`, { count: a.n })}</span>
                      <StatusChip
                        tone={a.status === "expired" ? "danger" : a.status === "expiring" ? "warning" : "info"}
                      >
                        {a.n}
                      </StatusChip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {canManage && (
        <section aria-labelledby="next-steps">
          <h2 id="next-steps" className="mb-4 label-mono-sm text-meta">
            {t("nextTitle")}
          </h2>
          <div className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline md:grid-cols-3">
            {[
              { key: "vessels", icon: <Ship />, href: "/vessels/new" },
              { key: "documents", icon: <FileText />, href: "/documents/new" },
              { key: "team", icon: <Users />, href: "/members" },
            ].map((step) => (
              <div key={step.key} className="flex flex-col panel p-6">
                <BracketIcon>{step.icon}</BracketIcon>
                <h3 className="mt-6 title-md text-foreground">{t(`steps.${step.key}.title`)}</h3>
                <p className="mt-2 flex-1 text-sm text-body">{t(`steps.${step.key}.body`)}</p>
                <Link href={step.href} className="mt-6 label-mono-sm text-accent hover:underline">
                  {t(`steps.${step.key}.action`)} →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
