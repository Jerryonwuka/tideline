"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { captainDb } from "@/lib/offline/db";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function usePendingCount() {
  return (
    useLiveQuery(async () => {
      const meta = await captainDb().meta.get("snapshot");
      if (!meta) return 0;
      return captainDb()
        .outbox.where("state")
        .equals("pending")
        .filter((o) => o.orgId === meta.orgId)
        .count();
    }) ?? 0
  );
}

/** "Saved on phone" until the server has it, then "Synced". */
export function SyncBadge({ synced }: { synced: boolean }) {
  const t = useTranslations("captain");
  return (
    <span className={synced ? "label-mono-sm text-meta" : "label-mono-sm text-warning"}>
      {synced ? t("synced") : t("savedOnPhone")}
    </span>
  );
}
