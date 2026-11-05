import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { RequestForm } from "@/components/charter/request-form";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney } from "@/lib/money";
import { uuid } from "@/lib/schemas/common";
import { cookies } from "next/headers";
import { activeMembership, ORG_COOKIE } from "@/server/auth/session";
import { boardListing } from "@/server/services/charter";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import { supabaseServer } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = uuid.safeParse((await params).id);
  if (!parsed.success) notFound();
  const listing = await boardListing(parsed.data).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const [t, tb, tTypes, tDocs, tStatus, format, locale, me] = await Promise.all([
    getTranslations("charter.listing"),
    getTranslations("charter.board"),
    getTranslations("vesselTypes"),
    getTranslations("documentTypes"),
    getTranslations("documentStatuses"),
    getFormatter(),
    getLocale(),
    getMe(await supabaseServer()),
  ]);
  const membership = me ? activeMembership(me, (await cookies()).get(ORG_COOKIE)?.value) : null;
  const canRequest = !!membership && ["owner", "manager", "charterer"].includes(membership.role);
  const v = listing.vessel;
  const specs = (
    [
      ["type", tTypes(v.type as "osv")],
      ["passengerCapacity", v.passengerCapacity],
      ["cargoCapacityT", v.cargoCapacityT],
      ["lengthM", v.lengthM],
      ["yearBuilt", v.yearBuilt],
      ["crewComplement", v.crewComplement],
      ["speedKn", v.speedKn],
      ["deckSpaceM2", v.deckSpaceM2],
      ["dpClass", v.dpClass],
    ] as const
  ).filter(([, value]) => value != null && value !== "");

  return (
    <AuthShell wide>
      <p className="label-mono-sm text-meta">{listing.operator.name}</p>
      <h1 className="heading text-foreground">{v.name}</h1>
      <p className="font-mono text-lg text-foreground">
        {tb("perDay", { amount: formatMoney(listing.dayRate, locale, { hideZeroFraction: true }) })} ·{" "}
        {tb("minDays", { count: listing.minDays })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <StatusChip tone={listing.operator.verified ? "success" : "neutral"}>
          {listing.operator.verified ? tb("verified") : tb("unverified")}
        </StatusChip>
        {listing.compliance != null && (
          <StatusChip tone="info">{tb("compliance", { score: listing.compliance })}</StatusChip>
        )}
      </div>
      {listing.description && <p className="mt-4 whitespace-pre-wrap text-body">{listing.description}</p>}
      <p className="mt-4 text-sm text-body">
        {t("area")}: {listing.operatingArea}
      </p>

      <h2 className="mt-6 title-md text-foreground">{t("specs")}</h2>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        {specs.map(([k, value]) => (
          <div key={k} className="flex justify-between border-b border-hairline py-1">
            <dt className="text-meta">{t(`spec.${k}`)}</dt>
            <dd className="text-foreground">{String(value)}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-6 title-md text-foreground">{t("documents")}</h2>
      {listing.documents.length === 0 ? (
        <p className="text-sm text-body">{t("noDocuments")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm" data-testid="public-documents">
          {listing.documents.map((d, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="text-foreground">{d.type ? tDocs(d.type as "other") : ""}</span>
              <span className="text-body">
                {d.status ? tStatus(d.status) : ""}
                {d.expiryDate &&
                  ` · ${format.dateTime(new Date(`${d.expiryDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 title-md text-foreground">{t("requestTitle")}</h2>
      {!me ? (
        <Link href={`/login?next=/board/${listing.id}`} className="mt-2 inline-block underline">
          {t("loginToRequest")}
        </Link>
      ) : !canRequest ? (
        <p className="text-sm text-body">{t("notCharterer")}</p>
      ) : (
        <RequestForm listingId={listing.id} orgId={membership!.orgId} currency={listing.dayRate.currency} />
      )}
    </AuthShell>
  );
}
