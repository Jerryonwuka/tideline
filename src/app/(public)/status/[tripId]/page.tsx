import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { TripStatusChip } from "@/components/ferry/trip-status";
import { uuid } from "@/lib/schemas/common";
import { ServiceError } from "@/server/services/errors";
import { publicTripStatus } from "@/server/services/tracking";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("tripStatus"))("title"), robots: { index: false } };
}

/** Public trip status for passengers and families: no names, phones or exact positions. */
export default async function TripStatusPage({ params }: { params: Promise<{ tripId: string }> }) {
  const parsed = uuid.safeParse((await params).tripId);
  if (!parsed.success) notFound();
  const s = await publicTripStatus(parsed.data).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const [t, format] = await Promise.all([getTranslations("tripStatus"), getFormatter()]);
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: "short", timeZone: s.timeZone });
  return (
    <AuthShell>
      {/* Refreshes itself every minute without client JavaScript. */}
      <meta httpEquiv="refresh" content="60" />
      <p className="label-mono-sm text-meta">{t("title")}</p>
      <h1 className="heading text-foreground">
        {s.from} → {s.to}
      </h1>
      <p className="text-body">{t("by", { vessel: s.vessel, operator: s.operator })}</p>
      <div className="mt-4 flex flex-col gap-2" data-testid="public-status">
        <TripStatusChip status={s.status} className="w-fit" />
        {s.status === "scheduled" || s.status === "boarding" ? (
          s.scheduledDeparture && (
            <p className="text-foreground">{t("scheduled", { time: time(s.scheduledDeparture) })}</p>
          )
        ) : s.status === "cancelled" ? (
          <p className="text-foreground">{t("cancelled")}</p>
        ) : (
          <>
            {s.departedAt && <p className="text-foreground">{t("departed", { time: time(s.departedAt) })}</p>}
            {s.eta && <p className="text-foreground">{t("eta", { time: time(s.eta) })}</p>}
            {s.arrivedAt && <p className="text-foreground">{t("arrived", { time: time(s.arrivedAt) })}</p>}
          </>
        )}
        {s.lastSeen && s.status === "departed" && (
          <p className="text-sm text-body">{t("lastSeen", { time: time(s.lastSeen) })}</p>
        )}
      </div>
      <p className="mt-6 text-xs text-meta">{t("refresh")}</p>
    </AuthShell>
  );
}
