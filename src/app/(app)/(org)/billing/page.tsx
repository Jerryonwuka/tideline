import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";
import { isErrorCode } from "@/server/services/errors";
import { billingOverview, confirmByVerify } from "@/server/services/payments";
import { subscribeAction } from "../billing-actions";

/** Plans in the org's currency, its subscription and the read-only state (§11). */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; error?: string }>;
}) {
  const { db, membership } = await requireOrgContext("/billing");
  const { reference, error } = await searchParams;
  const confirmed = reference ? await confirmByVerify(reference) : null;
  const [t, tPlans, te, format, locale, overview] = await Promise.all([
    getTranslations("billing"),
    getTranslations("plans"),
    getTranslations("errors"),
    getFormatter(),
    getLocale(),
    billingOverview(db, membership.orgId),
  ]);
  const owner = membership.role === "owner";
  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "—");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {error && isErrorCode(error) && <p className="text-sm text-danger">{te(error)}</p>}
      {confirmed === "success" && <p className="text-sm text-foreground">{t("confirmed")}</p>}
      {confirmed === "initiated" && <p className="text-sm text-body">{t("pending")}</p>}
      {!overview.writable && (
        <p role="status" className="rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          {t("readOnlyBanner")}
        </p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        {overview.plans.map((p) => {
          const sub = overview.subscriptions.find((s) => s.plan_code === p.code);
          return (
            <li
              key={p.code}
              className="flex flex-col gap-3 rounded-md border border-hairline-strong p-5"
              data-testid={`plan-${p.code}`}
            >
              <span className="title-md text-foreground">{tPlans(p.code as "ferry_basic")}</span>
              <span className="font-mono text-foreground">
                {formatMoney(p.unitPrice, locale, { hideZeroFraction: true })}{" "}
                <span className="text-sm text-body">{p.unit === "per_org" ? t("perOrg") : t("perVessel")}</span>
              </span>
              {p.unit === "per_vessel" && (
                <span className="text-sm text-body">
                  {t("forVessels", {
                    count: overview.charterVessels,
                    amount: formatMoney(p.periodPrice, locale, { hideZeroFraction: true }),
                  })}
                </span>
              )}
              {sub && (
                <span className="text-sm text-foreground" data-testid="subscription-status">
                  {t(`status.${sub.status}`, { date: date(sub.period_end) })}
                </span>
              )}
              {owner && (
                <form action={subscribeAction}>
                  <input type="hidden" name="planCode" value={p.code} />
                  <Button type="submit" variant={sub ? "primary" : "secondary"}>
                    {sub && sub.status !== "active" && sub.status !== "trialing" ? t("renew") : t("subscribe")}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-meta">{t("assumption")}</p>
    </div>
  );
}
