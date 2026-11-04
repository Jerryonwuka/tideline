import "server-only";
import { localDate } from "@/lib/dates";
import type { CaptainSnapshot, SyncOp, SyncResult } from "@/lib/schemas/sync";
import { myVessels } from "@/server/captain";
import { myCrewId, orgBasics } from "@/server/org-context";
import type { Me, MembershipSummary } from "@/server/services/profile";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";
import {
  addManifestEntry,
  arrive,
  cancelTrip,
  createAdHocTrip,
  depart,
  listTripsForDate,
  materialiseToday,
  removeManifestEntry,
  setLifejackets,
  startBoarding,
  tripLabel,
} from "./ferry";

// §8 conflict rules: the server's trip status wins once a trip has moved on (forward-only status,
// closed trips); manifest entries are additive and become amendments after departure (database
// trigger); anything else not allowed is rejected with its code so the phone can show why.
const CONFLICT_CODES = new Set(["invalid_transition", "trip_closed"]);

const MAX_FUTURE_MS = 2 * 60_000;
const MAX_PAST_MS = 7 * 24 * 60 * 60_000;

/**
 * When something happened, per the phone's clock. Phones can be wrong: a time in the future, or
 * more than a week old, falls back to the server's clock.
 */
export function clampClientTime(at: string, now: Date = new Date()): string {
  const t = Date.parse(at);
  if (Number.isNaN(t) || t > now.getTime() + MAX_FUTURE_MS || t < now.getTime() - MAX_PAST_MS) {
    return now.toISOString();
  }
  return new Date(Math.min(t, now.getTime())).toISOString();
}

export function classifyError(err: unknown): Pick<SyncResult, "status" | "code"> {
  if (!(err instanceof ServiceError)) throw err;
  return { status: CONFLICT_CODES.has(err.code) ? "conflict" : "rejected", code: err.code };
}

const namesRequired = (settings: unknown) =>
  (settings as { require_passenger_names?: boolean } | null)?.require_passenger_names ?? true;

interface SyncContext {
  orgId: string;
  userId: string;
  currency: string;
  country: string;
  crewId: string | null;
  namesRequired: boolean;
}

/** A trip by server id or by the client_id it was created with offline. */
async function resolveTrip(db: Db, orgId: string, ref: string) {
  const { data, error } = await db
    .from("trips")
    .select("id, currency")
    .eq("org_id", orgId)
    .or(`id.eq.${ref},client_id.eq.${ref}`)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  return data;
}

async function resolveEntry(db: Db, orgId: string, tripId: string, ref: string) {
  const { data, error } = await db
    .from("manifest_entries")
    .select("id")
    .eq("org_id", orgId)
    .eq("trip_id", tripId)
    .or(`id.eq.${ref},client_id.eq.${ref}`)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  return data.id;
}

async function applyOp(db: Db, ctx: SyncContext, op: SyncOp): Promise<string | null> {
  const at = clampClientTime(op.at);
  switch (op.op) {
    case "trip.create":
      return createAdHocTrip(
        db,
        ctx.orgId,
        ctx.currency,
        ctx.crewId,
        {
          vesselId: op.payload.vessel_id,
          routeId: op.payload.route_id,
          originText: op.payload.origin_text,
          destinationText: op.payload.destination_text,
          clientId: op.client_id,
        },
        at,
      );
    case "trip.step": {
      const trip = await resolveTrip(db, ctx.orgId, op.payload.trip);
      const p = op.payload;
      if (p.step === "boarding") await startBoarding(db, trip.id);
      else if (p.step === "lifejackets") await setLifejackets(db, trip.id, p.confirmed);
      else if (p.step === "depart") await depart(db, trip.id, at);
      else if (p.step === "arrive") await arrive(db, trip.id, trip.currency, p.cash, undefined, at);
      else await cancelTrip(db, trip.id);
      return trip.id;
    }
    case "manifest.add": {
      if (ctx.namesRequired && !op.payload.full_name) throw new ServiceError("validation");
      const trip = await resolveTrip(db, ctx.orgId, op.payload.trip);
      return addManifestEntry(db, ctx.orgId, trip.id, ctx.country, {
        fullName: op.payload.full_name,
        phone: op.payload.phone,
        seats: op.payload.seats,
        clientId: op.client_id,
      });
    }
    case "manifest.remove": {
      const trip = await resolveTrip(db, ctx.orgId, op.payload.trip);
      const entryId = await resolveEntry(db, ctx.orgId, trip.id, op.payload.entry);
      await removeManifestEntry(db, entryId);
      return entryId;
    }
  }
}

/**
 * Applies a batch in order. Each op runs once per (org, client_id): a replay returns the outcome
 * recorded the first time. An unexpected error stops the batch (the phone retries later; what was
 * already applied comes back as duplicates).
 */
export async function applySyncBatch(db: Db, me: Me, orgId: string, ops: SyncOp[]): Promise<SyncResult[]> {
  if (!me.memberships.some((m) => m.orgId === orgId && m.status === "active")) throw new ServiceError("forbidden");
  const org = await orgBasics(db, orgId);
  const ctx: SyncContext = {
    orgId,
    userId: me.userId,
    currency: org.currency,
    country: org.country_code,
    crewId: await myCrewId(db, orgId, me.userId),
    namesRequired: namesRequired(org.settings),
  };

  const { data: seen, error } = await db
    .from("sync_ops")
    .select("client_id, status, result")
    .eq("org_id", orgId)
    .in(
      "client_id",
      ops.map((o) => o.client_id),
    );
  if (error) throw fromDbError(error);
  const done = new Map(seen.map((s) => [s.client_id, s]));

  const results: SyncResult[] = [];
  for (const op of ops) {
    const prior = done.get(op.client_id);
    if (prior) {
      const r = prior.result as { id?: string | null; code?: string };
      results.push({ client_id: op.client_id, status: "duplicate", id: r.id ?? null, code: r.code });
      continue;
    }
    let result: SyncResult;
    try {
      result = { client_id: op.client_id, status: "applied", id: await applyOp(db, ctx, op) };
    } catch (err) {
      result = { client_id: op.client_id, ...classifyError(err) };
    }
    const { error: logError } = await db.from("sync_ops").insert({
      org_id: orgId,
      client_id: op.client_id,
      user_id: me.userId,
      op: op.op,
      status: result.status as "applied" | "conflict" | "rejected",
      result: { id: result.id ?? null, ...(result.code ? { code: result.code } : {}) },
      recorded_at: clampClientTime(op.at),
    });
    // 23505: the same op arrived twice at once; the first one's outcome stands.
    if (logError && logError.code !== "23505") throw fromDbError(logError);
    done.set(op.client_id, { client_id: op.client_id, status: "applied", result: {} });
    results.push(result);
  }
  return results;
}

/** Today's work for a captain's vessels (the office sees every ferry vessel), for the phone's cache. */
export async function captainSnapshot(db: Db, me: Me, membership: MembershipSummary): Promise<CaptainSnapshot> {
  const org = await orgBasics(db, membership.orgId);
  await materialiseToday(db, membership.orgId, org.time_zone);
  const [vessels, trips, routes] = await Promise.all([
    myVessels(db, membership, me.userId),
    listTripsForDate(db, membership.orgId, localDate(new Date(), org.time_zone), org.time_zone),
    db
      .from("routes")
      .select(
        "id, origin:jetties!routes_origin_jetty_id_jetties_id_fk(name), destination:jetties!routes_destination_jetty_id_jetties_id_fk(name)",
      )
      .eq("org_id", membership.orgId)
      .eq("active", true),
  ]);
  if (routes.error) throw fromDbError(routes.error);
  const mine = new Set(vessels.map((v) => v.id));
  const myTrips = trips.filter((t) => mine.has(t.vessel_id));
  const tripKey = new Map(myTrips.map((t) => [t.id, t.client_id ?? t.id]));

  let manifest: CaptainSnapshot["manifest"] = [];
  if (myTrips.length) {
    const { data, error } = await db
      .from("manifest_entries")
      .select("id, client_id, trip_id, full_name, seats, is_amendment, created_at")
      .in(
        "trip_id",
        myTrips.map((t) => t.id),
      )
      .order("created_at");
    if (error) throw fromDbError(error);
    manifest = data.map((m) => ({
      key: m.client_id ?? m.id,
      tripKey: tripKey.get(m.trip_id) ?? m.trip_id,
      name: m.full_name,
      seats: m.seats,
      amendment: m.is_amendment,
      createdAt: m.created_at,
    }));
  }

  return {
    generatedAt: new Date().toISOString(),
    orgId: membership.orgId,
    userId: me.userId,
    timeZone: org.time_zone,
    currency: org.currency,
    namesRequired: namesRequired(org.settings),
    vessels: vessels.map((v) => ({ id: v.id, name: v.name, capacity: v.passenger_capacity })),
    routes: routes.data.map((r) => ({ id: r.id, label: `${r.origin?.name} → ${r.destination?.name}` })),
    trips: myTrips.map((t) => ({
      key: t.client_id ?? t.id,
      vesselId: t.vessel_id,
      label: tripLabel(t),
      scheduledDeparture: t.scheduled_departure,
      status: t.status,
      lifejackets: t.lifejackets_confirmed,
      currency: t.currency,
    })),
    manifest,
  };
}
