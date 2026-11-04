import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { TripStatusChip } from "@/components/ferry/trip-status";
import { localDate } from "@/lib/dates";
import { requireOrgContext } from "@/server/auth/session";
import { myVessels } from "@/server/captain";
import { orgBasics } from "@/server/org-context";
import { listTripsForDate, materialiseToday, tripLabel } from "@/server/services/ferry";

export default async function CaptainToday() {
  const { db, me, membership } = await requireOrgContext("/captain");
  const org = await orgBasics(db, membership.orgId);
  await materialiseToday(db, membership.orgId, org.time_zone);
  const today = localDate(new Date(), org.time_zone);
  const [t, format, vessels, trips] = await Promise.all([
    getTranslations("captain"),
    getFormatter(),
    myVessels(db, membership, me.userId),
    listTripsForDate(db, membership.orgId, today, org.time_zone),
  ]);
  const mine = new Set(vessels.map((v) => v.id));
  const myTrips = trips.filter((tr) => mine.has(tr.vessel_id));
  const dateLabel = format.dateTime(new Date(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: org.time_zone,
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="heading text-foreground">{t("title")}</h1>
        <p className="text-body">{t("subtitle", { date: dateLabel })}</p>
      </div>
      {vessels.length === 0 ? (
        <p className="rounded-md border border-hairline p-4 text-body">{t("noVessels")}</p>
      ) : (
        <>
          <Link
            href="/captain/trips/new"
            className="flex h-14 items-center justify-center rounded-sm bg-primary label-mono text-primary-foreground"
          >
            {t("startAdHoc")}
          </Link>
          {myTrips.length === 0 ? (
            <p className="text-body">{t("noTrips")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {myTrips.map((trip) => (
                <li key={trip.id}>
                  <Link
                    href={`/captain/trips/${trip.id}`}
                    className="flex flex-col gap-2 rounded-md border border-hairline-strong p-4 active:bg-surface-raised"
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-mono text-xl text-foreground">
                        {trip.scheduled_departure
                          ? format.dateTime(new Date(trip.scheduled_departure), {
                              timeStyle: "short",
                              timeZone: org.time_zone,
                            })
                          : "—"}
                      </span>
                      <TripStatusChip status={trip.status} />
                    </span>
                    <span className="text-lg text-foreground">{tripLabel(trip)}</span>
                    <span className="text-sm text-body">
                      {trip.vessel?.name} · {trip.passenger_count}
                      {trip.vessel?.passenger_capacity != null && ` / ${trip.vessel.passenger_capacity}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
