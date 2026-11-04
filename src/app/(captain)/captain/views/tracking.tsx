"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { captainDb } from "@/lib/offline/db";
import { recordPosition } from "@/lib/offline/store";
import { knots, SAMPLE_MS, shouldRecord, trackingState, type TrackingState } from "@/lib/offline/tracking";
import { cn } from "@/lib/utils";

type WakeLock = { release(): Promise<void> };

/**
 * While the trip is departed: GPS every 30 s into the phone's queue (uploads when online), the
 * screen kept on where the browser allows, and "Tracking paused" when updates stop.
 */
export function Tracking({ tripKey }: { tripKey: string }) {
  const t = useTranslations("tracking");
  const [state, setState] = useState<TrackingState>("tracking");
  const fix = useRef<{ lat: number; lng: number; speedKn: number | null; accuracyM: number | null; at: number } | null>(
    null,
  );
  const lastRecorded = useRef<number | null>(null);
  const denied = useRef(false);
  const queued = useLiveQuery(() => captainDb().positions.where("tripKey").equals(tripKey).count(), [tripKey]) ?? 0;

  useEffect(() => {
    const startedAt = Date.now();
    const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
    let wake: WakeLock | null = null;

    const record = () => {
      const f = fix.current;
      const now = Date.now();
      if (f && shouldRecord(f.at, lastRecorded.current, now)) {
        lastRecorded.current = now;
        void recordPosition(tripKey, { ...f, at: new Date(now) });
      }
    };
    const update = () =>
      setState(
        trackingState({
          supported,
          denied: denied.current,
          visible: document.visibilityState === "visible",
          lastFixAt: fix.current?.at ?? null,
          startedAt,
          now: Date.now(),
        }),
      );

    const watch = supported
      ? navigator.geolocation.watchPosition(
          (p) => {
            denied.current = false;
            fix.current = {
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              speedKn: knots(p.coords.speed),
              accuracyM: p.coords.accuracy ?? null,
              at: Date.now(),
            };
            record();
            update();
          },
          (err) => {
            denied.current = err.code === err.PERMISSION_DENIED;
            update();
          },
          { enableHighAccuracy: true, maximumAge: 10_000, timeout: 60_000 },
        )
      : null;

    const keepAwake = async () => {
      const api = (navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<WakeLock> } }).wakeLock;
      if (api && document.visibilityState === "visible") wake = await api.request("screen").catch(() => null);
    };
    void keepAwake();
    const onVisible = () => {
      update();
      void keepAwake();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      record();
      update();
    }, SAMPLE_MS);
    update();

    return () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void wake?.release().catch(() => undefined);
    };
  }, [tripKey]);

  return (
    <p
      role="status"
      data-testid="tracking-state"
      className={cn(
        "flex items-center justify-between rounded-sm border px-3 py-2 text-sm",
        state === "tracking" ? "border-success/40 text-foreground" : "border-warning/40 bg-warning/10 text-foreground",
      )}
    >
      <span>{t(state)}</span>
      {queued > 0 && <span className="label-mono-sm text-meta">{t("queued", { count: queued })}</span>}
    </p>
  );
}
