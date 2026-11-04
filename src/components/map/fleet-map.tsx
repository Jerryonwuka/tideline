"use client";

import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { TripStatusChip, type TripStatus } from "@/components/ferry/trip-status";
import { mapboxToken, type MapMarker } from "./mapbox-view";

const MapboxView = dynamic(() => import("./mapbox-view").then((m) => m.MapboxView), { ssr: false });

export interface FleetItem {
  vesselId: string;
  vesselName: string;
  trip: { id: string; status: TripStatus; label: string; departedAt: string | null } | null;
  last: { recorded_at: string; lat: number; lng: number; speed_kn: number | null } | null;
}

/** The owner's live map: polls every 15 s, so a new point shows within a minute (§4.2). */
export function FleetMap({
  orgId,
  initial,
  timeZone,
  refreshMs,
}: {
  orgId: string;
  initial: FleetItem[];
  timeZone: string;
  refreshMs: number;
}) {
  const t = useTranslations("map");
  const format = useFormatter();
  const [fleet, setFleet] = useState(initial);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/v1/map?org_id=${orgId}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setFleet((await res.json()) as FleetItem[]);
    };
    const timer = window.setInterval(load, refreshMs);
    return () => window.clearInterval(timer);
  }, [orgId, refreshMs]);

  const markers: MapMarker[] = fleet.flatMap((f) =>
    f.last
      ? [
          {
            id: f.vesselId,
            lat: f.last.lat,
            lng: f.last.lng,
            label: `${f.vesselName} · ${f.trip?.label ?? ""}`,
            active: f.trip?.status === "departed",
          },
        ]
      : [],
  );

  return (
    <div className="flex flex-col gap-4">
      {mapboxToken() ? <MapboxView markers={markers} /> : <p className="text-sm text-body">{t("noToken")}</p>}
      <ul className="rounded-md border border-hairline" data-testid="fleet-list">
        {fleet.map((f) => (
          <li
            key={f.vesselId}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3 last:border-b-0"
          >
            <span className="flex flex-col">
              <span className="text-foreground">{f.vesselName}</span>
              <span className="text-sm text-body">{f.trip ? f.trip.label : t("noTrip")}</span>
            </span>
            <span className="flex items-center gap-3 text-sm text-body">
              {f.last ? (
                <span data-testid="last-seen">
                  {t("lastSeen", {
                    time: format.dateTime(new Date(f.last.recorded_at), { timeStyle: "short", timeZone }),
                  })}{" "}
                  ·{" "}
                  <span className="font-mono">
                    {f.last.lat.toFixed(4)}, {f.last.lng.toFixed(4)}
                  </span>
                </span>
              ) : (
                <span>{t("never")}</span>
              )}
              {f.trip && <TripStatusChip status={f.trip.status} />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
