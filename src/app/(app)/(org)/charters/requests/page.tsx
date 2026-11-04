import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { QuoteDecision, QuoteForm } from "@/components/charter/forms";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { addDays, localDate } from "@/lib/dates";
import { formatMoney, money } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { listRequests } from "@/server/services/charter";
import { listVessels } from "@/server/services/vessels";

/** Requests sent (charterer: accept or decline quotes) and received (owner: send quotes). */
export default async function CharterRequestsPage() {
  const { db, membership } = await requireOrgContext("/charters/requests");
  const [t, format, locale, org, requests, vessels] = await Promise.all([
    getTranslations("charter.requests"),
    getFormatter(),
    getLocale(),
    orgBasics(db, membership.orgId),
    listRequests(db, membership.orgId),
    listVessels(db, membership.orgId),
  ]);
  const canManage = membership.role === "owner" || membership.role === "manager";
  const charterVessels = vessels.filter((v) => v.charter_enabled).map((v) => ({ id: v.id, label: v.name }));
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const amount = (minor: number | string, currency: string) =>
    formatMoney(money(BigInt(minor), currency), locale, { hideZeroFraction: true });
  const until = addDays(localDate(new Date(), org.time_zone), 7);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {requests.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-md border border-hairline p-5"
              data-testid="charter-request"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-col">
                  <span className="label-mono-sm text-meta">{r.side === "owner" ? t("received") : t("sent")}</span>
                  <span className="title-md text-foreground">
                    {r.location} · {t("dates", { from: date(r.start_date), to: date(r.end_date) })}
                  </span>
                  <span className="text-sm text-body">
                    {r.side === "owner" && r.counterparty ? `${t("from", { org: r.counterparty.name })} · ` : ""}
                    {r.vesselName ?? ""}
                  </span>
                </span>
                <StatusChip tone={r.status === "accepted" ? "success" : r.status === "quoted" ? "info" : "neutral"}>
                  {t(`status.${r.status}`)}
                </StatusChip>
              </div>
              <p className="text-sm text-body">{r.purpose}</p>
              {r.quotes.map((q) => (
                <div
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-hairline px-4 py-3"
                  data-testid="charter-quote"
                >
                  <span className="text-sm text-foreground">
                    {t("quote", {
                      vessel: q.vesselName,
                      rate: amount(q.day_rate_minor, q.currency),
                      mobilisation: amount(q.mobilisation_minor, q.currency),
                      until: date(q.valid_until),
                    })}
                  </span>
                  {r.side === "charterer" && q.status === "sent" ? (
                    <QuoteDecision quoteId={q.id} />
                  ) : (
                    <StatusChip tone={q.status === "accepted" ? "success" : "neutral"}>
                      {t(`quoteStatus.${q.status}`)}
                    </StatusChip>
                  )}
                </div>
              ))}
              {r.status === "accepted" && <p className="text-sm text-foreground">{t("accepted")}</p>}
              {r.side === "owner" &&
                canManage &&
                (r.status === "open" || r.status === "quoted") &&
                charterVessels.length > 0 && (
                  <QuoteForm requestId={r.id} vessels={charterVessels} currency={org.currency} defaultUntil={until} />
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
