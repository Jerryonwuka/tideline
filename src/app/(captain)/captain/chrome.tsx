"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { clearOfflineData } from "@/lib/offline/store";
import { signOutAction } from "@/server/auth/actions";
import { usePendingCount } from "./parts";

/** Signing out wipes the phone's copy; unsynced changes would be lost, so ask first. */
export function CaptainSignOut({ label }: { label: string }) {
  const t = useTranslations("captain");
  const pending = usePendingCount();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={signOutAction}>
      <button
        type="button"
        className="text-sm text-body"
        onClick={async () => {
          if (pending > 0 && !window.confirm(t("signOutPending", { count: pending }))) return;
          await clearOfflineData().catch(() => undefined);
          form.current?.requestSubmit();
        }}
      >
        {label}
      </button>
    </form>
  );
}

/** The service worker caches the captain screens for offline use (production builds only). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    } else {
      // A worker left by a production run on this origin would serve stale dev chunks.
      void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
    }
  }, []);
  return null;
}
