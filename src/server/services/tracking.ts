import "server-only";
import type { PositionInput } from "@/lib/schemas/tracking";
import { supabaseAdmin } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";
import { tripLabel } from "./ferry";

// §4.2 tracking: GPS points from the captain's phone (queued offline, uploaded in order),
// the owner's live map, track replay and the public trip status page (no personal data).

/** How often the map refreshes; a new point shows within this plus the phone's 30 s cadence. */
export const MAP_REFRESH_MS = 15_000;

/**
 * Stores a batch of points (idempotent by client_id). Points the database refuses (not this
 * person's trip, outside the voyage) are reported as rejected so the phone drops them.
 */
export async function savePositions(db: Db, orgId: string, points: PositionInput[]) {
  const refs = [...new Set(points.map((p) => p.trip))];
  const { data: trips, error } = await db
    .from("trips")
    .select("id, client_id")
    .eq("org_id", orgId)
    .or(`id.in.(${refs.join(",")}),client_id.in.(${refs.join(",")})`);
  if (error) throw fromDbError(error);
  const byRef = new Map<string, string>();
  for (const t of trips) {
    byRef.set(t.id, t.id);
    if (t.client_id) byRef.set(t.client_id, t.id);
  }
  const rows = (ps: PositionInput[]) =>
    ps.flatMap((p) => {
      const tripId = byRef.get(p.trip);
      return tripId
        ? [
            {
              org_id: orgId,
              trip_id: tripId,
              recorded_at: p.recorded_at,
              lat: p.lat,
              lng: p.lng,
              speed_kn: p.speed_kn ?? null,
              accuracy_m: p.accuracy_m ?? null,
              client_id: p.client_id,
            },
          ]
        : [];
    });
  const ordered = [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const accepted: string[] = [];
  const rejected: string[] = ordered.filter((p) => !byRef.has(p.trip)).map((p) => p.client_id);
  const all = rows(ordered);
  const { error: bulkError } = await db
    .from("trip_positions")
    .upsert(all, { onConflict: "org_id,client_id", ignoreDuplicates: true });
  if (!bulkError) return { accepted: all.map((r) => r.client_id), rejected };
  // One bad point fails the whole insert: retry one by one to keep the good ones.
  for (const row of all) {
    const { error: e } = await db
      .from("trip_positions")
      .upsert(row, { onConflict: "org_id,client_id", ignoreDuplicates: true });
    (e ? rejected : accepted).push(row.client_id);
  }
  return { accepted, rejected };
}

export async function tripTrack(db: Db, tripId: string) {
  const { data, error } = await db
    .from("trip_positions")
    .select("recorded_at, lat, lng, speed_kn, accuracy_m")
    .eq("trip_id", tripId)
    .order("recorded_at");
  if (error) throw fromDbError(error);
  return data;
}

/** The fleet now: each vessel's current (or latest) trip today and its last known position. */
export async function liveFleet(db: Db, orgId: string, since: Date) {
  const [{ data: vessels, error: vErr }, { data: trips, error: tErr }] = await Promise.all([
    db.from("vessels").select("id, name").eq("org_id", orgId).eq("ferry_enabled", true).order("name"),
    db
      .from("trips")
      .select(
        "id, vessel_id, status, actual_departure, actual_arrival, origin_text, destination_text, route:routes(duration_min, origin:jetties!routes_origin_jetty_id_jetties_id_fk(name, lat, lng), destination:jetties!routes_destination_jetty_id_jetties_id_fk(name, lat, lng))",
      )
      .eq("org_id", orgId)
      .in("status", ["departed", "arrived"])
      .gte("actual_departure", since.toISOString())
      .order("actual_departure", { ascending: false }),
  ]);
  if (vErr) throw fromDbError(vErr);
  if (tErr) throw fromDbError(tErr);
  return Promise.all(
    vessels.map(async (v) => {
      const mine = trips.filter((t) => t.vessel_id === v.id);
      const trip = mine.find((t) => t.status === "departed") ?? mine[0] ?? null;
      let last: { recorded_at: string; lat: number; lng: number; speed_kn: number | null } | null = null;
      if (trip) {
        const { data } = await db
          .from("trip_positions")
          .select("recorded_at, lat, lng, speed_kn")
          .eq("trip_id", trip.id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        last = data;
      }
      return {
        vesselId: v.id,
        vesselName: v.name,
        trip: trip
          ? {
              id: trip.id,
              status: trip.status,
              label: tripLabel(trip),
              departedAt: trip.actual_departure,
              origin: trip.route?.origin ?? null,
              destination: trip.route?.destination ?? null,
            }
          : null,
        last,
      };
    }),
  );
}

/** Public status for passengers: no names, phones or exact positions. */
export async function publicTripStatus(tripId: string) {
  const { data, error } = await supabaseAdmin()
    .from("trips")
    .select(
      "id, status, scheduled_departure, actual_departure, actual_arrival, origin_text, destination_text, vessel:vessels(name), org:orgs(name), route:routes(duration_min, origin:jetties!routes_origin_jetty_id_jetties_id_fk(name, time_zone), destination:jetties!routes_destination_jetty_id_jetties_id_fk(name))",
    )
    .eq("id", tripId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  const { data: last } = await supabaseAdmin()
    .from("trip_positions")
    .select("recorded_at")
    .eq("trip_id", tripId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const duration = data.route?.duration_min ?? null;
  const eta =
    data.status === "departed" && data.actual_departure && duration
      ? new Date(Date.parse(data.actual_departure) + duration * 60_000).toISOString()
      : null;
  return {
    status: data.status,
    from: data.route?.origin?.name ?? data.origin_text ?? "",
    to: data.route?.destination?.name ?? data.destination_text ?? "",
    timeZone: data.route?.origin?.time_zone ?? "UTC",
    operator: data.org?.name ?? "",
    vessel: data.vessel?.name ?? "",
    scheduledDeparture: data.scheduled_departure,
    departedAt: data.actual_departure,
    arrivedAt: data.actual_arrival,
    eta,
    lastSeen: last?.recorded_at ?? null,
  };
}
