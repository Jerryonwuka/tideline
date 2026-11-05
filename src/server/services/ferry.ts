import "server-only";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/dates";
import { fromMajor, money, type Money } from "@/lib/money";
import { toE164 } from "@/lib/phone";
import type { AdHocTripInput, ManifestEntryInput, RouteInput, ScheduleInput } from "@/lib/schemas/ferry";
import type { TablesUpdate } from "@/lib/database.types";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

// ----- Jetties ----------------------------------------------------------------------------------

export async function listJetties(db: Db, countryCode: string) {
  const { data, error } = await db
    .from("jetties")
    .select("id, name, aliases, admin_area, lat, lng, status, time_zone")
    .eq("country_code", countryCode)
    .order("name");
  if (error) throw fromDbError(error);
  return data;
}

export async function proposeJetty(
  db: Db,
  orgId: string,
  input: { name: string; aliases: string[]; lat: number; lng: number },
) {
  const { data: org } = await db.from("orgs").select("country_code, time_zone").eq("id", orgId).single();
  if (!org) throw new ServiceError("forbidden");
  const { data, error } = await db
    .from("jetties")
    .insert({
      country_code: org.country_code,
      time_zone: org.time_zone,
      name: input.name,
      aliases: input.aliases,
      lat: input.lat,
      lng: input.lng,
      status: "proposed",
      proposed_by_org_id: orgId,
    })
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  return data.id;
}

// ----- Routes and schedules -----------------------------------------------------------------------

const ROUTE_COLUMNS =
  "id, org_id, duration_min, distance_km, base_fare_minor, currency, active, origin:jetties!routes_origin_jetty_id_jetties_id_fk(id, name, time_zone), destination:jetties!routes_destination_jetty_id_jetties_id_fk(id, name)";

export async function listRoutes(db: Db, orgId: string) {
  const { data, error } = await db.from("routes").select(ROUTE_COLUMNS).eq("org_id", orgId).order("created_at");
  if (error) throw fromDbError(error);
  return data;
}

export async function createRoute(db: Db, orgId: string, currency: string, input: RouteInput) {
  const { data, error } = await db
    .from("routes")
    .insert({
      org_id: orgId,
      origin_jetty_id: input.originJettyId,
      destination_jetty_id: input.destinationJettyId,
      duration_min: input.durationMin,
      distance_km: input.distanceKm ?? null,
      base_fare_minor: Number(fromMajor(input.baseFare, currency).amountMinor),
      currency,
    })
    .select("id")
    .single();
  if (error) throw error.message === "invalid_subject" ? new ServiceError("validation") : fromDbError(error);
  return data.id;
}

export async function setRouteActive(db: Db, routeId: string, active: boolean) {
  const { data, error } = await db.from("routes").update({ active }).eq("id", routeId).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new ServiceError("forbidden");
}

export async function listSchedules(db: Db, orgId: string) {
  const { data, error } = await db
    .from("schedules")
    .select("id, route_id, vessel_id, days_of_week, departure_time, active, vessel:vessels(name)")
    .eq("org_id", orgId)
    .order("departure_time");
  if (error) throw fromDbError(error);
  return data;
}

export async function createSchedule(db: Db, orgId: string, input: ScheduleInput) {
  const { data, error } = await db
    .from("schedules")
    .insert({
      org_id: orgId,
      route_id: input.routeId,
      vessel_id: input.vesselId,
      days_of_week: [...new Set(input.daysOfWeek)].sort(),
      departure_time: input.departureTime,
    })
    .select("id")
    .single();
  if (error) throw error.message === "invalid_subject" ? new ServiceError("validation") : fromDbError(error);
  return data.id;
}

export async function setScheduleActive(db: Db, scheduleId: string, active: boolean) {
  const { data, error } = await db.from("schedules").update({ active }).eq("id", scheduleId).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new ServiceError("forbidden");
}

// ----- Trips ------------------------------------------------------------------------------------

export const TRIP_COLUMNS =
  "id, org_id, client_id, vessel_id, captain_crew_id, route_id, origin_text, destination_text, scheduled_departure, actual_departure, actual_arrival, status, passenger_count, lifejackets_confirmed, takings_cash_minor, takings_digital_minor, currency, source, notes, created_at, vessel:vessels(name, passenger_capacity), route:routes(origin:jetties!routes_origin_jetty_id_jetties_id_fk(name), destination:jetties!routes_destination_jetty_id_jetties_id_fk(name)), captain:crew_members(full_name)";

export type TripRow = Awaited<ReturnType<typeof getTrip>>;

export function tripLabel(t: {
  route: { origin: { name: string } | null; destination: { name: string } | null } | null;
  origin_text: string | null;
  destination_text: string | null;
}): string {
  const from = t.route?.origin?.name ?? t.origin_text ?? "?";
  const to = t.route?.destination?.name ?? t.destination_text ?? "?";
  return `${from} → ${to}`;
}

/** Creates today's scheduled trips (idempotent) so captains see them. */
export async function materialiseToday(db: Db, orgId: string, timeZone: string) {
  const { error } = await db.rpc("materialise_schedule_trips", {
    p_org: orgId,
    p_date: localDate(new Date(), timeZone),
  });
  if (error) throw fromDbError(error);
}

/** Trips whose scheduled (or actual) departure falls on a local date in the org's zone. */
export async function listTripsForDate(db: Db, orgId: string, date: string, timeZone: string, vesselId?: string) {
  const from = zonedTimeToUtc(`${date}T00:00`, timeZone).toISOString();
  const to = zonedTimeToUtc(`${addDays(date, 1)}T00:00`, timeZone).toISOString();
  let q = db
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("org_id", orgId)
    .or(
      `and(scheduled_departure.gte.${from},scheduled_departure.lt.${to}),and(scheduled_departure.is.null,created_at.gte.${from},created_at.lt.${to})`,
    );
  if (vesselId) q = q.eq("vessel_id", vesselId);
  const { data, error } = await q.order("scheduled_departure", { ascending: true, nullsFirst: false });
  if (error) throw fromDbError(error);
  return data;
}

export async function getTrip(db: Db, id: string) {
  const { data, error } = await db.from("trips").select(TRIP_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  return data;
}

/** An ad-hoc trip, started by a captain (as themselves) or the office. Idempotent by clientId. */
export async function createAdHocTrip(
  db: Db,
  orgId: string,
  currency: string,
  captainCrewId: string | null,
  input: AdHocTripInput,
  startedAt?: string,
) {
  const row = {
    org_id: orgId,
    vessel_id: input.vesselId,
    route_id: input.routeId ?? null,
    origin_text: input.routeId ? null : (input.originText ?? null),
    destination_text: input.routeId ? null : (input.destinationText ?? null),
    captain_crew_id: captainCrewId,
    currency,
    client_id: input.clientId ?? null,
    scheduled_departure: startedAt ?? new Date().toISOString(),
  };
  const { data, error } = input.clientId
    ? await db.from("trips").upsert(row, { onConflict: "org_id,client_id" }).select("id").single()
    : await db.from("trips").insert(row).select("id").single();
  if (error) throw error.message === "invalid_subject" ? new ServiceError("validation") : fromDbError(error);
  return data.id;
}

async function updateTrip(db: Db, id: string, patch: TablesUpdate<"trips">) {
  const { data, error } = await db.from("trips").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
}

export const startBoarding = (db: Db, id: string) => updateTrip(db, id, { status: "boarding" });
export const setLifejackets = (db: Db, id: string, confirmed: boolean) =>
  updateTrip(db, id, { lifejackets_confirmed: confirmed });
/** `at` is when it happened on the boat (offline phones sync later); default now. */
export const depart = (db: Db, id: string, at?: string) =>
  updateTrip(db, id, { status: "departed", ...(at ? { actual_departure: at } : {}) });
export const cancelTrip = (db: Db, id: string, notes?: string) =>
  updateTrip(db, id, { status: "cancelled", ...(notes ? { notes } : {}) });

/** Closes a trip: arrival time, final passenger count and the cash collected. */
export async function arrive(db: Db, id: string, currency: string, cash?: string, notes?: string, at?: string) {
  const cashMinor = cash ? Number(fromMajor(cash, currency).amountMinor) : 0;
  await updateTrip(db, id, {
    status: "arrived",
    takings_cash_minor: cashMinor,
    ...(notes ? { notes } : {}),
    ...(at ? { actual_arrival: at } : {}),
  });
}

// ----- Manifest ---------------------------------------------------------------------------------

export async function listManifest(db: Db, tripId: string) {
  const { data, error } = await db
    .from("manifest_entries")
    .select("id, full_name, phone_e164, age_band, seats, boarded_at, is_amendment, created_at")
    .eq("trip_id", tripId)
    .order("created_at");
  if (error) throw fromDbError(error);
  return data;
}

export async function addManifestEntry(
  db: Db,
  orgId: string,
  tripId: string,
  country: string,
  input: ManifestEntryInput,
) {
  const phone = input.phone ? toE164(input.phone, country) : null;
  if (input.phone && !phone) throw new ServiceError("invalid_phone");
  const kin = input.nextOfKinPhone ? toE164(input.nextOfKinPhone, country) : null;
  const row = {
    org_id: orgId,
    trip_id: tripId,
    full_name: input.fullName ?? null,
    phone_e164: phone,
    age_band: input.ageBand ?? null,
    next_of_kin_phone: kin,
    seats: input.seats,
    client_id: input.clientId ?? null,
  };
  const { data, error } = input.clientId
    ? await db
        .from("manifest_entries")
        .upsert(row, { onConflict: "org_id,client_id", ignoreDuplicates: true })
        .select("id")
    : await db.from("manifest_entries").insert(row).select("id");
  if (error) throw fromDbError(error);
  return data[0]?.id ?? null;
}

export async function removeManifestEntry(db: Db, entryId: string) {
  const { data, error } = await db.from("manifest_entries").delete().eq("id", entryId).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new ServiceError("forbidden");
}

export async function markBoarded(db: Db, entryId: string) {
  const { data, error } = await db
    .from("manifest_entries")
    .update({ boarded_at: new Date().toISOString() })
    .eq("id", entryId)
    .select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new ServiceError("forbidden");
}

// ----- Reports ----------------------------------------------------------------------------------

export interface DailyReportRow {
  vesselId: string;
  vesselName: string;
  trips: number;
  passengers: number;
  cash: Money;
  digital: Money;
}

/** Per-vessel totals for one local day: completed and in-progress trips (cancelled excluded). */
export async function dailyReport(
  db: Db,
  orgId: string,
  date: string,
  timeZone: string,
  currency: string,
  vesselId?: string,
) {
  const trips = (await listTripsForDate(db, orgId, date, timeZone, vesselId)).filter((t) => t.status !== "cancelled");
  const rows = new Map<string, DailyReportRow>();
  for (const t of trips) {
    const row = rows.get(t.vessel_id) ?? {
      vesselId: t.vessel_id,
      vesselName: t.vessel?.name ?? "",
      trips: 0,
      passengers: 0,
      cash: money(0, t.currency),
      digital: money(0, t.currency),
    };
    row.trips += 1;
    row.passengers += t.passenger_count;
    row.cash = money(row.cash.amountMinor + BigInt(t.takings_cash_minor), t.currency);
    row.digital = money(row.digital.amountMinor + BigInt(t.takings_digital_minor), t.currency);
    rows.set(t.vessel_id, row);
  }
  const list = [...rows.values()].sort((a, b) => a.vesselName.localeCompare(b.vesselName));
  return {
    date,
    trips,
    rows: list,
    totals: {
      trips: list.reduce((s, r) => s + r.trips, 0),
      passengers: list.reduce((s, r) => s + r.passengers, 0),
      cash: money(
        list.reduce((s, r) => s + r.cash.amountMinor, 0n),
        currency,
      ),
      digital: money(
        list.reduce((s, r) => s + r.digital.amountMinor, 0n),
        currency,
      ),
    },
  };
}
