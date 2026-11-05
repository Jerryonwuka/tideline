import "server-only";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/dates";
import { money, type Money } from "@/lib/money";
import type { Db } from "@/server/supabase/server";
import { fromDbError } from "./errors";
import { dailyReport } from "./ferry";

// The owner's dashboard (§9.1) and weekly report. All money is summed per currency in minor units;
// an org's trips share its currency, so totals are in that currency.

/** A vessel with no trip for this many days (and none today) counts as idle. */
export const IDLE_DAYS = 7;

export interface DashboardSummary {
  today: string;
  trips: { total: number; scheduled: number; boarding: number; departed: number; arrived: number; cancelled: number };
  passengers: number;
  takings: { cash: Money; digital: Money; total: Money };
  alerts: {
    expiredDocuments: number;
    expiringDocuments: number;
    needsReview: number;
    openIncidents: number;
    pendingOverrides: number;
  };
  idleVessels: { id: string; name: string; lastTripAt: string | null }[];
}

export async function idleVessels(db: Db, orgId: string, now: Date) {
  const since = new Date(now.getTime() - IDLE_DAYS * 86_400_000).toISOString();
  const [{ data: vessels, error }, { data: recent, error: tErr }, { data: last }] = await Promise.all([
    db.from("vessels").select("id, name, status").eq("org_id", orgId).neq("status", "laid_up").order("name"),
    db.from("trips").select("vessel_id").eq("org_id", orgId).neq("status", "cancelled").gte("created_at", since),
    db
      .from("trips")
      .select("vessel_id, created_at")
      .eq("org_id", orgId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (error) throw fromDbError(error);
  if (tErr) throw fromDbError(tErr);
  const busy = new Set(recent.map((t) => t.vessel_id));
  const lastTrip = new Map<string, string>();
  for (const t of last ?? []) if (!lastTrip.has(t.vessel_id)) lastTrip.set(t.vessel_id, t.created_at);
  return vessels
    .filter((v) => !busy.has(v.id) && v.status !== "on_charter" && v.status !== "maintenance")
    .map((v) => ({ id: v.id, name: v.name, lastTripAt: lastTrip.get(v.id) ?? null }));
}

export async function dashboardSummary(
  db: Db,
  org: { id: string; time_zone: string; currency: string },
  now: Date = new Date(),
): Promise<DashboardSummary> {
  const today = localDate(now, org.time_zone);
  const [report, docs, incidents, overrides, idle] = await Promise.all([
    dailyReport(db, org.id, today, org.time_zone, org.currency),
    db.from("documents_live").select("effective_status").eq("org_id", org.id),
    db.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "open"),
    db.from("safety_override_requests").select("id, decision:safety_overrides(id)").eq("org_id", org.id),
    idleVessels(db, org.id, now),
  ]);
  if (docs.error) throw fromDbError(docs.error);
  const statuses = docs.data.map((d) => d.effective_status);
  const statusesToday = report.trips.map((t) => t.status);
  const cancelledToday = await cancelledCount(db, org, today);
  const count = (s: string) => statusesToday.filter((x) => x === s).length;
  return {
    today,
    trips: {
      total: report.trips.length + cancelledToday,
      scheduled: count("scheduled"),
      boarding: count("boarding"),
      departed: count("departed"),
      arrived: count("arrived"),
      cancelled: cancelledToday,
    },
    passengers: report.totals.passengers,
    takings: {
      cash: report.totals.cash,
      digital: report.totals.digital,
      total: money(report.totals.cash.amountMinor + report.totals.digital.amountMinor, org.currency),
    },
    alerts: {
      expiredDocuments: statuses.filter((s) => s === "expired").length,
      expiringDocuments: statuses.filter((s) => s === "expiring").length,
      needsReview: statuses.filter((s) => s === "needs_review").length,
      openIncidents: incidents.count ?? 0,
      pendingOverrides: (overrides.data ?? []).filter(
        (o) => !o.decision || (Array.isArray(o.decision) && !o.decision.length),
      ).length,
    },
    idleVessels: idle,
  };
}

async function cancelledCount(db: Db, org: { id: string; time_zone: string }, date: string) {
  const from = zonedTimeToUtc(`${date}T00:00`, org.time_zone).toISOString();
  const to = zonedTimeToUtc(`${addDays(date, 1)}T00:00`, org.time_zone).toISOString();
  const { count } = await db
    .from("trips")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("status", "cancelled")
    .gte("scheduled_departure", from)
    .lt("scheduled_departure", to);
  return count ?? 0;
}

// ----- Weekly report ---------------------------------------------------------------------------------

export interface WeeklyReport {
  from: string;
  to: string;
  days: { date: string; trips: number; passengers: number; cash: Money; digital: Money }[];
  vessels: { vesselId: string; vesselName: string; trips: number; passengers: number; cash: Money; digital: Money }[];
  expenses: { category: string; amount: Money }[];
  totals: { trips: number; passengers: number; cash: Money; digital: Money; expenses: Money; net: Money };
}

/** Seven local days from `from` (inclusive): trips, passengers, takings, expenses and the net. */
export async function weeklyReport(
  db: Db,
  org: { id: string; time_zone: string; currency: string },
  from: string,
): Promise<WeeklyReport> {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const reports = await Promise.all(dates.map((d) => dailyReport(db, org.id, d, org.time_zone, org.currency)));
  const zero = () => money(0, org.currency);
  const vessels = new Map<string, WeeklyReport["vessels"][number]>();
  for (const r of reports) {
    for (const row of r.rows) {
      const v = vessels.get(row.vesselId) ?? { ...row, trips: 0, passengers: 0, cash: zero(), digital: zero() };
      vessels.set(row.vesselId, {
        ...v,
        trips: v.trips + row.trips,
        passengers: v.passengers + row.passengers,
        cash: money(v.cash.amountMinor + row.cash.amountMinor, org.currency),
        digital: money(v.digital.amountMinor + row.digital.amountMinor, org.currency),
      });
    }
  }
  const start = zonedTimeToUtc(`${from}T00:00`, org.time_zone).toISOString();
  const end = zonedTimeToUtc(`${addDays(from, 7)}T00:00`, org.time_zone).toISOString();
  const { data: expenseRows, error } = await db
    .from("expenses")
    .select("category, amount_minor, currency")
    .eq("org_id", org.id)
    .eq("currency", org.currency)
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) throw fromDbError(error);
  const byCategory = new Map<string, bigint>();
  for (const e of expenseRows) byCategory.set(e.category, (byCategory.get(e.category) ?? 0n) + BigInt(e.amount_minor));
  const sum = (xs: Money[]) =>
    money(
      xs.reduce((s, m) => s + m.amountMinor, 0n),
      org.currency,
    );
  const cash = sum(reports.map((r) => r.totals.cash));
  const digital = sum(reports.map((r) => r.totals.digital));
  const expenses = money(
    [...byCategory.values()].reduce((s, v) => s + v, 0n),
    org.currency,
  );
  return {
    from,
    to: dates[6]!,
    days: reports.map((r) => ({
      date: r.date,
      trips: r.totals.trips,
      passengers: r.totals.passengers,
      cash: r.totals.cash,
      digital: r.totals.digital,
    })),
    vessels: [...vessels.values()].sort((a, b) => a.vesselName.localeCompare(b.vesselName)),
    expenses: [...byCategory.entries()]
      .map(([category, v]) => ({ category, amount: money(v, org.currency) }))
      .sort((a, b) => a.category.localeCompare(b.category)),
    totals: {
      trips: reports.reduce((s, r) => s + r.totals.trips, 0),
      passengers: reports.reduce((s, r) => s + r.totals.passengers, 0),
      cash,
      digital,
      expenses,
      net: money(cash.amountMinor + digital.amountMinor - expenses.amountMinor, org.currency),
    },
  };
}

/** Monday of the week containing a local date. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
