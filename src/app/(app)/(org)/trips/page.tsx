import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { TripStatusChip } from "@/components/ferry/trip-status";
import { Input } from "@/components/ui/input";
import { localDate } from "@/lib/dates";
import { formatMoney, money } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { listTripsForDate, materialiseToday, tripLabel } from "@/server/services/ferry";

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { db, membership } = await requireOrgContext("/trips");
  const org = await orgBasics(db, membership.orgId);
  const today = localDate(new Date(), org.time_zone);
  const requested = (await searchParams).date;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  if (date === today) await materialiseToday(db, membership.orgId, org.time_zone);
  const [t, format, trips] = await Promise.all([
    getTranslations("ferry.trips"),
    getFormatter(),
    listTripsForDate(db, membership.orgId, date, org.time_zone),
  ]);
  const time = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { timeStyle: "short", timeZone: org.time_zone }) : "—";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <form className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="label-mono-sm text-meta">{t("date")}</span>
              <Input type="date" name="date" defaultValue={date} className="h-10 w-44" />
            </label>
            <button
              type="submit"
              className="h-10 rounded-xs border border-hairline-strong px-3 text-sm text-body hover:text-foreground"
            >
              →
            </button>
          </form>
        }
      />
      {trips.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline label-mono-sm text-meta">
                {(["time", "vessel", "route", "captain", "passengers", "takings", "status"] as const).map((c) => (
                  <th key={c} className="px-4 py-3 font-medium">
                    {t(`columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <tr key={trip.id} className="border-b border-hairline last:border-b-0 hover:bg-surface">
                  <td className="px-4 py-3 font-mono text-foreground">
                    <Link href={`/trips/${trip.id}`} className="hover:text-accent">
                      {time(trip.actual_departure ?? trip.scheduled_departure)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-body">{trip.vessel?.name}</td>
                  <td className="px-4 py-3 text-body">{tripLabel(trip)}</td>
                  <td className="px-4 py-3 text-body">{trip.captain?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-body">{trip.passenger_count}</td>
                  <td className="px-4 py-3 font-mono text-xs text-body">
                    {formatMoney(money(trip.takings_cash_minor, trip.currency), org.default_locale)}
                  </td>
                  <td className="px-4 py-3">
                    <TripStatusChip status={trip.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
