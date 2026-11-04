import { getTranslations } from "next-intl/server";
import { ProposeJettyForm, RouteForm, ScheduleForm } from "@/components/ferry/forms";
import { PageHeader } from "@/components/fleet/page-header";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney, money } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { listJetties, listRoutes, listSchedules } from "@/server/services/ferry";
import { listVessels } from "@/server/services/vessels";
import { toggleRouteAction } from "../ferry-actions";

export default async function RoutesPage() {
  const { db, membership } = await requireOrgContext("/routes");
  const org = await orgBasics(db, membership.orgId);
  const [t, tDays, jetties, routes, schedules, vessels] = await Promise.all([
    getTranslations("ferry.routes"),
    getTranslations("weekdays"),
    listJetties(db, org.country_code),
    listRoutes(db, membership.orgId),
    listSchedules(db, membership.orgId),
    listVessels(db, membership.orgId),
  ]);
  const canManage = membership.role === "owner" || membership.role === "manager";
  const jettyOptions = jetties.map((j) => ({
    id: j.id,
    label: j.status === "proposed" ? `${j.name} · ${t("proposedJetty")}` : j.name,
  }));
  const vesselOptions = vessels.filter((v) => v.ferry_enabled).map((v) => ({ id: v.id, label: v.name }));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {canManage && (
        <section aria-labelledby="add-route" className="rounded-md border border-hairline-strong panel p-6">
          <h2 id="add-route" className="mb-4 title-md text-foreground">
            {t("add")}
          </h2>
          <RouteForm jetties={jettyOptions} currency={org.currency} />
        </section>
      )}
      {routes.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {routes.map((r) => {
            const mine = schedules.filter((s) => s.route_id === r.id);
            return (
              <li key={r.id} className="rounded-md border border-hairline">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
                  <div className="flex flex-col">
                    <span className="title-md text-foreground">
                      {r.origin?.name} → {r.destination?.name}
                    </span>
                    <span className="text-sm text-body">
                      {formatMoney(money(r.base_fare_minor, r.currency), org.default_locale, {
                        hideZeroFraction: true,
                      })}{" "}
                      · {r.duration_min} min
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {!r.active && <StatusChip tone="neutral">{t("inactive")}</StatusChip>}
                    {canManage && (
                      <form action={toggleRouteAction}>
                        <input type="hidden" name="routeId" value={r.id} />
                        <input type="hidden" name="active" value={String(!r.active)} />
                        <Button type="submit" variant="ghost" size="sm">
                          {r.active ? t("pause") : t("resume")}
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 px-5 py-4">
                  <span className="label-mono-sm text-meta">{t("schedulesTitle")}</span>
                  {mine.length === 0 ? (
                    <p className="text-sm text-meta">{t("noSchedules")}</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-sm">
                      {mine.map((s) => (
                        <li key={s.id} className="flex flex-wrap gap-3">
                          <span className="font-mono text-foreground">{s.departure_time.slice(0, 5)}</span>
                          <span className="text-body">{s.vessel?.name}</span>
                          <span className="text-meta">{s.days_of_week.map((d) => tDays(String(d))).join(" ")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canManage && <ScheduleForm routeId={r.id} vessels={vesselOptions} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canManage && (
        <section aria-labelledby="propose" className="rounded-md border border-hairline p-6">
          <h2 id="propose" className="title-md text-foreground">
            {t("proposeTitle")}
          </h2>
          <p className="mt-1 mb-4 text-sm text-body">{t("proposeBody")}</p>
          <ProposeJettyForm />
        </section>
      )}
    </div>
  );
}
