import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { TripStatusChip } from "@/components/ferry/trip-status";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney, money } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { ServiceError } from "@/server/services/errors";
import { getTrip, listManifest, tripLabel } from "@/server/services/ferry";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, membership } = await requireOrgContext(`/trips/${id}`);
  const trip = await getTrip(db, id).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const org = await orgBasics(db, membership.orgId);
  const [t, format, manifest] = await Promise.all([
    getTranslations("ferry.trip"),
    getFormatter(),
    listManifest(db, id),
  ]);
  const when = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone: org.time_zone }) : "—";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={tripLabel(trip)}
        subtitle={`${trip.vessel?.name ?? ""}${trip.captain ? ` · ${trip.captain.full_name}` : ""}`}
        eyebrow={<TripStatusChip status={trip.status} className="w-fit" />}
      />
      <dl className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-4">
        {[
          [t("departed"), when(trip.actual_departure)],
          [t("arrived"), when(trip.actual_arrival)],
          [t("cash"), formatMoney(money(trip.takings_cash_minor, trip.currency), org.default_locale)],
          [t("digital"), formatMoney(money(trip.takings_digital_minor, trip.currency), org.default_locale)],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="label-mono-sm text-meta">{label}</dt>
            <dd className="mt-1 text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="flex flex-col gap-3">
        <h2 className="title-lg text-foreground">
          {t("manifest")} · {t("seats", { count: manifest.reduce((s, m) => s + m.seats, 0) })}
          {trip.vessel?.passenger_capacity != null && (
            <span className="text-meta"> / {trip.vessel.passenger_capacity}</span>
          )}
        </h2>
        {trip.lifejackets_confirmed && (
          <StatusChip tone="success" className="w-fit">
            {t("lifejackets")}
          </StatusChip>
        )}
        {manifest.length === 0 ? (
          <p className="text-sm text-meta">{t("noPassengers")}</p>
        ) : (
          <ul className="rounded-md border border-hairline">
            {manifest.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2 text-sm last:border-b-0"
              >
                <span className="text-foreground">{m.full_name ?? "—"}</span>
                <span className="flex items-center gap-2 text-meta">
                  {t("seats", { count: m.seats })}
                  {m.is_amendment && <StatusChip tone="warning">{t("amendment")}</StatusChip>}
                  {m.boarded_at && <StatusChip tone="success">{t("boarded")}</StatusChip>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {trip.notes && (
        <p className="text-sm text-body">
          <span className="label-mono-sm text-meta">{t("notes")}: </span>
          {trip.notes}
        </p>
      )}
    </div>
  );
}
