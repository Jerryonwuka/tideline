"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { CaptainSnapshot } from "@/lib/schemas/sync";
import { captainDb } from "@/lib/offline/db";
import { applySnapshot, requestSync } from "@/lib/offline/store";
import { go, useView } from "./nav";
import { useOnline, usePendingCount } from "./parts";
import { NewTripView } from "./views/new-trip";
import { PendingView } from "./views/pending";
import { TodayView } from "./views/today";
import { TripView } from "./views/trip";

const SYNC_EVERY_MS = 30_000;

/**
 * The captain app: the server snapshot seeds the phone's store, every screen reads from the store,
 * and the outbox syncs on load, on reconnect, when the app comes back to the front and every 30 s.
 */
export function CaptainApp({ initial }: { initial: CaptainSnapshot }) {
  const t = useTranslations("captain");
  const view = useView();
  const online = useOnline();
  const pending = usePendingCount();
  const [ready, setReady] = useState(false);
  const meta = useLiveQuery(() => captainDb().meta.get("snapshot"));

  useEffect(() => {
    applySnapshot(initial)
      .catch(() => undefined)
      .finally(() => {
        setReady(true);
        void requestSync();
      });
  }, [initial]);

  useEffect(() => {
    const sync = () => void requestSync();
    const onVisible = () => document.visibilityState === "visible" && sync();
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(sync, SYNC_EVERY_MS);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  // Before the store is open the server HTML and the first client render match (no view-specific markup).
  if (!ready || meta === undefined) return <p className="text-body">{t("loading")}</p>;
  if (!meta) return <p className="rounded-md border border-hairline p-4 text-body">{t("notCached")}</p>;

  return (
    <div className="flex flex-col gap-5">
      {!online ? (
        <p
          role="status"
          className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
        >
          {t("offline", { count: pending })}{" "}
          {pending > 0 && (
            <button type="button" onClick={() => go({ name: "pending" })} className="underline">
              {t("viewPending")}
            </button>
          )}
        </p>
      ) : (
        pending > 0 && (
          <p role="status" className="rounded-sm border border-hairline px-3 py-2 text-sm text-body">
            {t("pendingOnline", { count: pending })}{" "}
            <button type="button" onClick={() => go({ name: "pending" })} className="underline">
              {t("viewPending")}
            </button>
          </p>
        )
      )}
      {view.name === "trip" ? (
        <TripView tripKey={view.key} />
      ) : view.name === "new" ? (
        <NewTripView />
      ) : view.name === "pending" ? (
        <PendingView />
      ) : (
        <TodayView />
      )}
    </div>
  );
}
