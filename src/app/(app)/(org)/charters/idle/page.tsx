import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { OutreachButton, PublishSuggestionForm } from "@/components/charter/idle-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import type { BuyerReason, PriceSuggestion } from "@/lib/idle";
import { formatMoney, money, toMajorString } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";
import { listSuggestions } from "@/server/services/idle";

type Inputs = PriceSuggestion["inputs"] & { idle_days: number; area: string | null };
type Buyer = { org_id: string; name: string; score: number; reasons: BuyerReason[] };

/** §10.4: idle vessels with a rule-based day rate (inputs shown), AI text to check, and buyers. */
export default async function IdleVesselsPage() {
  const { db, membership } = await requireOrgContext("/charters/idle");
  const [t, locale, rows] = await Promise.all([
    getTranslations("idle"),
    getLocale(),
    listSuggestions(db, membership.orgId),
  ]);
  const m = (minor: string | number | null, currency: string) =>
    minor ? formatMoney(money(BigInt(minor), currency), locale) : "";
  const pct = (bps: number) => String(bps / 100);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {!rows.length ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        rows.map((s) => {
          const i = s.inputs as unknown as Inputs;
          const buyers = s.buyers as unknown as Buyer[];
          return (
            <section
              key={s.id}
              className="flex flex-col gap-6 rounded-md border border-hairline p-6"
              data-testid="idle-suggestion"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="title-md text-foreground">{s.vessel?.name}</h2>
                <StatusChip tone="warning">{t("idleFor", { days: Number(i.idle_days) })}</StatusChip>
              </header>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="flex flex-col gap-3">
                  <span className="label-mono-sm text-meta">{t("suggested")}</span>
                  {s.suggested_rate_minor ? (
                    <span className="display-sm font-mono text-foreground" data-testid="idle-rate">
                      {m(s.suggested_rate_minor, s.currency)}
                    </span>
                  ) : (
                    <p className="text-body">{t("noRate")}</p>
                  )}
                  <h3 className="mt-2 label-mono-sm text-meta">{t("howWorkedOut")}</h3>
                  <dl
                    className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-4 gap-y-2 text-sm"
                    data-testid="idle-inputs"
                  >
                    <dt className="text-meta">{t("inputs.baseline")}</dt>
                    <dd className="text-foreground">
                      {t(`inputs.source.${i.baseline_source}`, {
                        count:
                          i.baseline_source === "vessel"
                            ? i.vessel_charters
                            : i.baseline_source === "org_same_type"
                              ? i.org_same_type_charters
                              : i.board_listings,
                      })}
                      {i.baseline_minor ? `: ${m(i.baseline_minor, s.currency)}` : ""}
                    </dd>
                    <dt className="text-meta">{t("inputs.board")}</dt>
                    <dd className="text-foreground">
                      {i.board_listings && i.board_median_minor
                        ? t("inputs.boardDetail", {
                            count: i.board_listings,
                            median: m(i.board_median_minor, s.currency),
                            weight: pct(i.baseline_source === "board" ? 0 : i.board_weight_bps),
                          })
                        : t("inputs.boardNone")}
                    </dd>
                    <dt className="text-meta">{t("inputs.weeks")}</dt>
                    <dd className="text-foreground">
                      {t("inputs.weeksDetail", {
                        weeks: i.weeks_idle,
                        step: pct(i.weekly_step_bps),
                        total: pct(i.reduction_bps),
                      })}
                    </dd>
                    <dt className="text-meta">{t("inputs.minimum")}</dt>
                    <dd className="text-foreground">
                      {i.min_rate_minor ? m(i.min_rate_minor, s.currency) : t("inputs.minimumNone")}
                      {i.floored ? ` · ${t("inputs.floored")}` : ""}
                    </dd>
                  </dl>
                  {s.rationale && (
                    <div className="mt-2 flex flex-col gap-1">
                      <span className="label-mono-sm text-meta">{t("rationale")}</span>
                      <p className="text-sm text-body">{s.rationale}</p>
                      <p className="text-xs text-meta">{t("aiNote")}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <span className="label-mono-sm text-meta">{t("buyers")}</span>
                  {!buyers.length ? (
                    <p className="text-sm text-body">{t("buyersNone")}</p>
                  ) : (
                    <ol className="rounded-md border border-hairline" data-testid="idle-buyers">
                      {buyers.map((b) => (
                        <li
                          key={b.org_id}
                          data-testid="idle-buyer"
                          className="flex flex-col gap-2 border-b border-hairline px-4 py-3 last:border-b-0"
                        >
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-foreground">{b.name}</span>
                            <span className="flex flex-wrap gap-1">
                              {b.reasons.map((r) => (
                                <StatusChip key={r} tone={r === "past_client" ? "success" : "info"}>
                                  {t(`reason.${r}`)}
                                </StatusChip>
                              ))}
                            </span>
                          </span>
                          <OutreachButton vesselId={s.vessel_id} buyerOrgId={b.org_id} />
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>

              {s.published_listing_id && s.review_status === "accepted" ? (
                <p className="flex items-center gap-3 text-sm text-foreground" data-testid="idle-published">
                  {t("published")}
                  <Link href={`/board/${s.published_listing_id}`} className="text-accent hover:underline">
                    {t("viewListing")}
                  </Link>
                </p>
              ) : (
                <PublishSuggestionForm
                  vesselId={s.vessel_id}
                  currency={s.currency}
                  rate={s.suggested_rate_minor ? toMajorString(money(BigInt(s.suggested_rate_minor), s.currency)) : ""}
                  area={i.area ?? ""}
                  description={s.listing_description ?? ""}
                />
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
