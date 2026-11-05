"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { captainDb } from "@/lib/offline/db";
import { dismissFailed, requestSync } from "@/lib/offline/store";
import { go } from "../nav";
import { useOnline } from "../parts";

const OP_LABEL = {
  "trip.create": "ops.tripCreate",
  "manifest.add": "ops.manifestAdd",
  "manifest.remove": "ops.manifestRemove",
  "safety.check": "ops.safetyCheck",
  "safety.ack": "ops.safetyAck",
} as const;

/** Everything saved on this phone that the server doesn't have yet, oldest first. */
export function PendingView() {
  const t = useTranslations("captain.pending");
  const tt = useTranslations("captain.trip");
  const te = useTranslations("errors");
  const format = useFormatter();
  const online = useOnline();
  const [syncing, setSyncing] = useState(false);
  const data = useLiveQuery(async () => {
    const db = captainDb();
    const meta = await db.meta.get("snapshot");
    const items = (await db.outbox.orderBy("createdAt").toArray()).filter((o) => o.orgId === meta?.orgId);
    const trips = new Map((await db.trips.toArray()).map((tr) => [tr.key, tr.label]));
    return { items, trips, timeZone: meta?.timeZone };
  });
  if (!data) return null;

  const describe = (item: (typeof data.items)[number]) => {
    const op = item.op;
    if (op.op === "trip.step") return t("ops.tripStep", { step: t(`steps.${op.payload.step}`) });
    return t(OP_LABEL[op.op]);
  };
  const tripOf = (item: (typeof data.items)[number]) =>
    data.trips.get(
      item.op.op === "trip.create" ? item.op.client_id : "trip" in item.op.payload ? item.op.payload.trip : "",
    );

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={() => go({ name: "today" })} className="w-fit text-sm text-body">
        ← {tt("back")}
      </button>
      <div>
        <h1 className="heading text-foreground">{t("title")}</h1>
        <p className="text-body">{t("intro")}</p>
      </div>
      {data.items.length === 0 ? (
        <p className="rounded-md border border-hairline p-4 text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline">
          {data.items.map((item) => (
            <li
              key={item.clientId}
              className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
            >
              <span className="flex flex-col gap-1">
                <span className="text-foreground">{describe(item)}</span>
                <span className="text-sm text-body">
                  {tripOf(item) ?? ""} ·{" "}
                  {format.dateTime(new Date(item.createdAt), { timeStyle: "short", timeZone: data.timeZone })}
                </span>
                {item.state === "failed" && (
                  <span className="text-sm text-danger">
                    {t("failed")}: {te.has(item.code ?? "") ? te(item.code as "unknown") : te("unknown")}
                  </span>
                )}
              </span>
              {item.state === "failed" && (
                <button type="button" onClick={() => dismissFailed(item.clientId)} className="text-sm text-body">
                  {t("dismiss")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {online && data.items.some((i) => i.state === "pending") && (
        <button
          type="button"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            await requestSync();
            setSyncing(false);
          }}
          className="h-14 rounded-sm border border-hairline-strong label-mono text-foreground disabled:opacity-50"
        >
          {t("syncNow")}
        </button>
      )}
    </div>
  );
}
