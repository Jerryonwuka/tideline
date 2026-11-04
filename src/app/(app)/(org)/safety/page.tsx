import { getFormatter, getTranslations } from "next-intl/server";
import { DecisionForm, ThresholdsForm } from "@/components/ferry/safety-forms";
import { PageHeader } from "@/components/fleet/page-header";
import type { Reason } from "@/lib/safety/engine";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { effectiveThresholds, pendingOverrides } from "@/server/services/safety";
import { getTrip, tripLabel } from "@/server/services/ferry";

/** Owner's safety page: override requests to decide, and the org's (stricter-only) limits. */
export default async function SafetyPage() {
  const { db, membership } = await requireOrgContext("/safety");
  const org = await orgBasics(db, membership.orgId);
  const [t, format, pending, limits] = await Promise.all([
    getTranslations("safety"),
    getFormatter(),
    pendingOverrides(db, membership.orgId),
    effectiveThresholds(db, membership.orgId, org.country_code),
  ]);
  const trips = await Promise.all(pending.map((p) => getTrip(db, p.trip_id).catch(() => null)));
  const canManage = membership.role === "owner" || membership.role === "manager";

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title={t("inbox.title")} subtitle={t("inbox.subtitle")} />
      {pending.length === 0 ? (
        <p className="text-body">{t("inbox.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((p, i) => {
            const check = Array.isArray(p.check) ? p.check[0] : p.check;
            const trip = trips[i];
            const reasons = ((check?.reasons ?? []) as unknown as Reason[]).filter((r) => r.severity === "block");
            return (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-md border border-danger/40 p-5"
                data-testid="override-request"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="title-md text-foreground">
                    {trip ? `${tripLabel(trip)} · ${trip.vessel?.name}` : ""}
                  </span>
                  <span className="text-sm text-body">
                    {format.dateTime(new Date(p.requested_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: org.time_zone,
                    })}
                  </span>
                </div>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {reasons.map((r) => (
                    <li key={r.code}>
                      {t(`reasons.${r.code}`, { value: String(r.value ?? ""), limit: String(r.limit ?? "") })}
                    </li>
                  ))}
                </ul>
                {p.note && <p className="text-sm text-body">{t("inbox.note", { note: p.note })}</p>}
                <DecisionForm requestId={p.id} />
              </li>
            );
          })}
        </ul>
      )}

      <section
        aria-labelledby="limits"
        className="flex flex-col gap-4 rounded-md border border-hairline-strong panel p-6"
      >
        <div>
          <h2 id="limits" className="title-md text-foreground">
            {t("thresholds.title")}
          </h2>
          <p className="text-sm text-body">{t("thresholds.subtitle")}</p>
          <p className="text-xs text-meta">{t("thresholds.placeholderNote")}</p>
        </div>
        {canManage && <ThresholdsForm current={limits.thresholds} defaults={limits.defaults} />}
      </section>
    </div>
  );
}
