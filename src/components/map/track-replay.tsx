"use client";

import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { mapboxToken } from "./mapbox-view";

const MapboxView = dynamic(() => import("./mapbox-view").then((m) => m.MapboxView), { ssr: false });

interface Point {
  recorded_at: string;
  lat: number;
  lng: number;
  speed_kn: number | null;
}

/**
 * Track replay: drag through the voyage. Drawn as a simple outline without a map token, on the
 * Mapbox map with one.
 */
export function TrackReplay({ points, timeZone }: { points: Point[]; timeZone: string }) {
  const t = useTranslations("map");
  const format = useFormatter();
  const [at, setAt] = useState(points.length - 1);
  if (!points.length) return <p className="text-body">{t("noTrack")}</p>;
  const shown = points.slice(0, at + 1);
  const current = shown[shown.length - 1]!;

  // Fit the track into the box (equirectangular; fine at harbour scale).
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxLat - minLat, maxLng - minLng, 0.001);
  const xy = (p: Point) => [10 + ((p.lng - minLng) / span) * 280, 190 - ((p.lat - minLat) / span) * 180] as const;

  return (
    <div className="flex flex-col gap-3" data-testid="track-replay">
      {mapboxToken() ? (
        <MapboxView
          markers={[{ id: "boat", lat: current.lat, lng: current.lng, label: current.recorded_at, active: true }]}
          line={shown.map((p) => [p.lng, p.lat])}
        />
      ) : (
        <svg
          viewBox="0 0 300 200"
          className="h-56 w-full rounded-md border border-hairline bg-surface-sunken"
          role="img"
          aria-label={t("track")}
        >
          <polyline
            points={points.map((p) => xy(p).join(",")).join(" ")}
            fill="none"
            className="stroke-hairline-strong"
            strokeWidth={2}
          />
          <polyline
            points={shown.map((p) => xy(p).join(",")).join(" ")}
            fill="none"
            className="stroke-accent"
            strokeWidth={3}
          />
          <circle cx={xy(current)[0]} cy={xy(current)[1]} r={5} className="fill-accent" />
        </svg>
      )}
      <label className="flex flex-col gap-1 text-sm text-body">
        <span>
          {t("replay")}: {format.dateTime(new Date(current.recorded_at), { timeStyle: "medium", timeZone })}
          {current.speed_kn != null && ` · ${current.speed_kn} kn`} · {t("points", { count: points.length })}
        </span>
        <input
          type="range"
          min={0}
          max={points.length - 1}
          value={at}
          onChange={(e) => setAt(Number(e.target.value))}
          aria-label={t("replay")}
        />
      </label>
    </div>
  );
}
