"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useFormatter, useTranslations } from "next-intl";
import { TripStatusChip } from "@/components/ferry/trip-status";
import { captainDb } from "@/lib/offline/db";
import { seatsOf } from "@/lib/offline/model";
import { go } from "../nav";
import { SyncBadge } from "../parts";

export function TodayView() {
  const t = useTranslations("captain");
  const format = useFormatter();
  const data = useLiveQuery(async () => {
    const db = captainDb();
    const [meta, vessels, trips, manifest] = await Promise.all([
      db.meta.get("snapshot"),
      db.vessels.toArray(),
      db.trips.toArray(),
      db.manifest.toArray(),
    ]);
    trips.sort((a, b) => (a.scheduledDeparture ?? "").localeCompare(b.scheduledDeparture ?? ""));
    return { meta, vessels, trips, manifest };
  });
  if (!data?.meta) return null;
  const { meta, vessels, trips, manifest } = data;
  const vesselById = new Map(vessels.map((v) => [v.id, v]));
  const dateLabel = format.dateTime(new Date(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: meta.timeZone,
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
          <button
            type="button"
            onClick={() => go({ name: "new" })}
            className="flex h-14 items-center justify-center rounded-sm bg-primary label-mono text-primary-foreground"
          >
            {t("startAdHoc")}
          </button>
          {trips.length === 0 ? (
            <p className="text-body">{t("noTrips")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {trips.map((trip) => {
                const vessel = vesselById.get(trip.vesselId);
                const seats = seatsOf(manifest.filter((m) => m.tripKey === trip.key));
                return (
                  <li key={trip.key}>
                    <button
                      type="button"
                      onClick={() => go({ name: "trip", key: trip.key })}
                      className="flex w-full flex-col gap-2 rounded-md border border-hairline-strong p-4 text-left active:bg-surface-raised"
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-mono text-xl text-foreground">
                          {trip.scheduledDeparture
                            ? format.dateTime(new Date(trip.scheduledDeparture), {
                                timeStyle: "short",
                                timeZone: meta.timeZone,
                              })
                            : "—"}
                        </span>
                        <TripStatusChip status={trip.status} />
                      </span>
                      <span className="text-lg text-foreground">{trip.label}</span>
                      <span className="flex items-center justify-between text-sm text-body">
                        <span>
                          {vessel?.name} · {seats}
                          {vessel?.capacity != null && ` / ${vessel.capacity}`}
                        </span>
                        <SyncBadge synced={trip.synced} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
