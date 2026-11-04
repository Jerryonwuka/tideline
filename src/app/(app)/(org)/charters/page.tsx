import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ListingForm } from "@/components/charter/forms";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney, money } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { listOwnListings } from "@/server/services/charter";
import { listCharters } from "@/server/services/contracts";
import { RecordCharterForm } from "@/components/charter/contract-forms";
import { listDocuments } from "@/server/services/documents";
import { listVessels } from "@/server/services/vessels";

/** Owner: listings on the public charter board. */
export default async function ChartersPage() {
  const { db, membership } = await requireOrgContext("/charters");
  const [t, tc, tDocs, locale, org, listings, vessels, docs, charters, tCh] = await Promise.all([
    getTranslations("charter.listings"),
    getTranslations("charter"),
    getTranslations("documentTypes"),
    getLocale(),
    orgBasics(db, membership.orgId),
    listOwnListings(db, membership.orgId),
    listVessels(db, membership.orgId),
    listDocuments(db, { orgId: membership.orgId }),
    listCharters(db, membership.orgId),
    getTranslations("charter.charters"),
  ]);
  const charterVessels = vessels.filter((v) => v.charter_enabled);
  const canManage = membership.role === "owner" || membership.role === "manager";
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex gap-4">
            <Link href="/charters/requests" className="label-mono-sm text-accent hover:underline">
              {tc("requestsNav")}
            </Link>
            <Link href="/board" className="label-mono-sm text-accent hover:underline">
              {tc("board.title")}
            </Link>
          </div>
        }
      />
      {canManage && (
        <section className="rounded-md border border-hairline-strong panel p-6">
          <h2 className="mb-4 title-md text-foreground">{t("new")}</h2>
          {charterVessels.length === 0 ? (
            <p className="text-sm text-body">{t("noVessels")}</p>
          ) : (
            <ListingForm
              currency={org.currency}
              vessels={charterVessels.map((v) => ({ id: v.id, label: v.name }))}
              documents={docs
                .filter((d) => d.status !== "rejected")
                .map((d) => ({
                  id: d.id!,
                  label: d.document_type_code ? tDocs(d.document_type_code as "other") : "",
                  subject: d.subject_type === "org" ? "org" : d.subject_id!,
                }))}
            />
          )}
        </section>
      )}
      {listings.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline">
          {listings.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3 last:border-b-0"
            >
              <span className="flex flex-col">
                <span className="text-foreground">{l.vessel?.name}</span>
                <span className="text-sm text-body">
                  {formatMoney(money(BigInt(l.day_rate_minor), l.currency), locale, { hideZeroFraction: true })} ·{" "}
                  {l.operating_area}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <StatusChip tone={l.status === "live" ? "success" : "neutral"}>{t(`status.${l.status}`)}</StatusChip>
                {l.status === "live" && (
                  <Link href={`/board/${l.id}`} className="text-sm text-accent hover:underline">
                    {tc("board.view")}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <section className="flex flex-col gap-4" aria-labelledby="charters-list">
        <h2 id="charters-list" className="title-md text-foreground">
          {tCh("title")}
        </h2>
        {charters.length === 0 ? (
          <p className="text-body">{tCh("empty")}</p>
        ) : (
          <ul className="rounded-md border border-hairline" data-testid="charters-list">
            {charters.map((c) => (
              <li key={c.id} className="border-b border-hairline last:border-b-0">
                <Link
                  href={`/charters/${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface"
                >
                  <span className="flex flex-col">
                    <span className="text-foreground">
                      {c.vesselName} · {c.side === "owner" ? c.chartererName : c.ownerName}
                    </span>
                    <span className="text-sm text-body">
                      {c.start_date} – {c.end_date}
                      {!c.booked_on_platform && ` · ${tCh("offPlatform")}`}
                    </span>
                  </span>
                  <StatusChip tone="info">{tCh(`status.${c.status}`)}</StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canManage && charterVessels.length > 0 && (
          <div className="rounded-md border border-hairline p-5">
            <h3 className="title-md text-foreground">{tCh("recordTitle")}</h3>
            <p className="mb-3 text-sm text-body">{tCh("recordHint")}</p>
            <RecordCharterForm
              vessels={charterVessels.map((v) => ({ id: v.id, label: v.name }))}
              currency={org.currency}
            />
          </div>
        )}
      </section>
    </div>
  );
}
