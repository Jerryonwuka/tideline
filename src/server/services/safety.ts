import "server-only";
import { createTranslator } from "next-intl";
import type { Json } from "@/lib/database.types";
import { localDate } from "@/lib/dates";
import {
  canOverride,
  DEFAULT_TRIP_MINUTES,
  evaluateSafety,
  type Reason,
  type SafetyInput,
  type Thresholds,
  type WeatherInput,
} from "@/lib/safety/engine";
import { sunTimes } from "@/lib/safety/sun";
import type { ThresholdsInput } from "@/lib/schemas/safety";
import { defaultLocale, isLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import { now as clockNow } from "@/server/clock";
import { serverEnv } from "@/server/env";
import { integrations } from "@/server/integrations";
import type { Me } from "@/server/services/profile";
import { supabaseAdmin, type AdminDb } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";
import { midpoint, weatherFor, type Place } from "./weather";

// §4.2 safety lock. The server computes and stores every check (people can't insert them); the
// phone runs the same engine offline and the server recomputes on sync with the phone's cached
// weather. Acknowledgements, override requests and decisions are inserted under RLS.

/** Used only if no published rule set (country or global) has defaults. */
const FALLBACK: Thresholds = {
  maxWindKmh: 30,
  maxGustKmh: 40,
  maxWaveM: 1,
  maxPrecipMmH: 10,
  nightBlock: true,
  permittedStart: null,
  permittedEnd: null,
};

const hhmm = (t: string | null) => t?.slice(0, 5) ?? null;

export async function defaultThresholds(db: Db, countryCode: string): Promise<Thresholds> {
  const { data, error } = await db.rpc("safety_defaults_for", { p_country: countryCode });
  if (error) throw fromDbError(error);
  const d = data[0];
  if (!d) return FALLBACK;
  return {
    maxWindKmh: Number(d.max_wind_kmh),
    maxGustKmh: Number(d.max_gust_kmh),
    maxWaveM: Number(d.max_wave_m),
    maxPrecipMmH: Number(d.max_precip_mm_h),
    nightBlock: d.night_block,
    permittedStart: hhmm(d.permitted_start),
    permittedEnd: hhmm(d.permitted_end),
  };
}

/** The org's own (stricter) limits, else the country defaults. */
export async function effectiveThresholds(
  db: Db,
  orgId: string,
  countryCode: string,
): Promise<{ thresholds: Thresholds; defaults: Thresholds; custom: boolean }> {
  const defaults = await defaultThresholds(db, countryCode);
  const { data, error } = await db.from("safety_thresholds").select("*").eq("org_id", orgId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) return { thresholds: defaults, defaults, custom: false };
  return {
    thresholds: {
      maxWindKmh: Number(data.max_wind_kmh),
      maxGustKmh: Number(data.max_gust_kmh),
      maxWaveM: Number(data.max_wave_m),
      maxPrecipMmH: Number(data.max_precip_mm_h),
      nightBlock: data.night_block,
      permittedStart: hhmm(data.permitted_start),
      permittedEnd: hhmm(data.permitted_end),
    },
    defaults,
    custom: true,
  };
}

/** Saves an org's limits; the database refuses anything looser than the defaults. */
export async function saveThresholds(db: Db, orgId: string, input: ThresholdsInput) {
  const { error } = await db.from("safety_thresholds").upsert({
    org_id: orgId,
    max_wind_kmh: input.maxWindKmh,
    max_gust_kmh: input.maxGustKmh,
    max_wave_m: input.maxWaveM,
    max_precip_mm_h: input.maxPrecipMmH,
    night_block: input.nightBlock,
    permitted_start: input.permittedStart ?? null,
    permitted_end: input.permittedEnd ?? null,
  });
  if (error) throw fromDbError(error);
}

// ----- Inputs ------------------------------------------------------------------------------------

const TRIP_SAFETY_COLUMNS =
  "id, org_id, vessel_id, captain_crew_id, status, lifejackets_confirmed, route:routes(duration_min, origin:jetties!routes_origin_jetty_id_jetties_id_fk(lat, lng, time_zone), destination:jetties!routes_destination_jetty_id_jetties_id_fk(lat, lng)), vessel:vessels(passenger_capacity, operating_country_code, type, ferry_enabled, charter_enabled), org:orgs(country_code, time_zone)";

export interface TripSafetyContext {
  tripId: string;
  orgId: string;
  countryCode: string;
  timeZone: string;
  origin: (Place & { timeZone: string }) | null;
  destination: Place | null;
  durationMin: number;
  seats: number;
  capacity: number | null;
  lifejackets: boolean;
  thresholds: Thresholds;
  expiredDocuments: string[];
}

/** Required document types (from the published rule sets) whose every copy has expired. */
async function expiredRequired(
  db: Db,
  orgId: string,
  subjectType: "vessel" | "crew",
  subjectId: string,
  requirement: { country: string; vesselType: string; modes: string[] },
): Promise<string[]> {
  const { data: required, error } = await db.rpc("compliance_requirements", {
    p_country: requirement.country,
    p_vessel_type: requirement.vesselType,
    p_modes: requirement.modes,
    p_applies_to: subjectType,
  });
  if (error) throw fromDbError(error);
  const codes = new Set(required.filter((r) => r.mandatory).map((r) => r.document_type_code));
  if (!codes.size) return [];
  const { data: docs, error: docError } = await db
    .from("documents_live")
    .select("document_type_code, effective_status")
    .eq("org_id", orgId)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId);
  if (docError) throw fromDbError(docError);
  const byType = new Map<string, string[]>();
  for (const d of docs ?? []) {
    if (!d.document_type_code || !codes.has(d.document_type_code)) continue;
    byType.set(d.document_type_code, [...(byType.get(d.document_type_code) ?? []), d.effective_status ?? ""]);
  }
  return [...byType.entries()].filter(([, s]) => s.every((x) => x === "expired")).map(([code]) => code);
}

export async function tripSafetyContext(db: Db, tripId: string): Promise<TripSafetyContext> {
  const { data: trip, error } = await db.from("trips").select(TRIP_SAFETY_COLUMNS).eq("id", tripId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!trip || !trip.org || !trip.vessel) throw new ServiceError("not_found");
  const { data: entries, error: mErr } = await db.from("manifest_entries").select("seats").eq("trip_id", trip.id);
  if (mErr) throw fromDbError(mErr);
  const v = trip.vessel;
  const modes = [...(v.ferry_enabled ? ["ferry"] : []), ...(v.charter_enabled ? ["charter"] : [])];
  const req = { country: v.operating_country_code, vesselType: v.type, modes };
  const [vesselExpired, captainExpired, { thresholds }] = await Promise.all([
    expiredRequired(db, trip.org_id, "vessel", trip.vessel_id, req),
    trip.captain_crew_id ? expiredRequired(db, trip.org_id, "crew", trip.captain_crew_id, req) : Promise.resolve([]),
    effectiveThresholds(db, trip.org_id, trip.org.country_code),
  ]);
  const origin = trip.route?.origin ?? null;
  return {
    tripId: trip.id,
    orgId: trip.org_id,
    countryCode: trip.org.country_code,
    timeZone: origin?.time_zone ?? trip.org.time_zone,
    origin: origin ? { lat: origin.lat, lng: origin.lng, timeZone: origin.time_zone } : null,
    destination: trip.route?.destination ?? null,
    durationMin: trip.route?.duration_min ?? DEFAULT_TRIP_MINUTES,
    seats: (entries ?? []).reduce((n, e) => n + e.seats, 0),
    capacity: v.passenger_capacity,
    lifejackets: trip.lifejackets_confirmed,
    thresholds,
    expiredDocuments: [...new Set([...vesselExpired, ...captainExpired])],
  };
}

/** Where to look at the weather: the origin jetty and the route midpoint. */
export function weatherPlaces(ctx: Pick<TripSafetyContext, "origin" | "destination">): Place[] {
  if (!ctx.origin) return [];
  return ctx.destination ? [ctx.origin, midpoint(ctx.origin, ctx.destination)] : [ctx.origin];
}

export function safetyInput(ctx: TripSafetyContext, at: Date, weather: WeatherInput | null): SafetyInput {
  const arrival = new Date(at.getTime() + ctx.durationMin * 60_000);
  const sun = ctx.origin ? sunTimes(localDate(at, ctx.origin.timeZone), ctx.origin.lat, ctx.origin.lng) : null;
  return {
    now: at,
    departure: at,
    arrival,
    timeZone: ctx.timeZone,
    sun,
    thresholds: ctx.thresholds,
    weather,
    seats: ctx.seats,
    capacity: ctx.capacity,
    lifejackets: ctx.lifejackets,
    expiredDocuments: ctx.expiredDocuments,
  };
}

// ----- Checks ------------------------------------------------------------------------------------

function assertCanRun(me: Me, orgId: string) {
  const m = me.memberships.find((x) => x.orgId === orgId && x.status === "active");
  if (!m || !["owner", "manager", "captain"].includes(m.role)) throw new ServiceError("forbidden");
}

export interface CheckOptions {
  /** Offline checks: when the phone ran it and the weather it had cached. */
  offline?: { checkedAt: string; weather: WeatherInput | null };
  clientId?: string;
}

/** Runs the rules for a trip and stores the check (append-only). Idempotent by clientId. */
export async function runSafetyCheck(db: Db, me: Me, tripId: string, opts: CheckOptions = {}) {
  const ctx = await tripSafetyContext(db, tripId);
  assertCanRun(me, ctx.orgId);
  const admin = supabaseAdmin();
  if (opts.clientId) {
    const { data: existing } = await admin
      .from("safety_checks")
      .select("*")
      .eq("org_id", ctx.orgId)
      .eq("client_id", opts.clientId)
      .maybeSingle();
    if (existing) return existing;
  }
  const at = opts.offline ? new Date(opts.offline.checkedAt) : clockNow();
  const arrival = new Date(at.getTime() + ctx.durationMin * 60_000);
  const weather = opts.offline
    ? opts.offline.weather
    : await weatherFor(admin, integrations().weather, weatherPlaces(ctx), at, arrival, at);
  const input = safetyInput(ctx, at, weather);
  const { result, reasons } = evaluateSafety(input);
  const { data, error } = await admin
    .from("safety_checks")
    .insert({
      org_id: ctx.orgId,
      trip_id: ctx.tripId,
      checked_at: at.toISOString(),
      checked_by: me.userId,
      weather_snapshot: (weather as unknown as Json) ?? null,
      weather_fetched_at: weather?.fetchedAt ?? null,
      sunrise: input.sun?.sunrise.toISOString() ?? null,
      sunset: input.sun?.sunset.toISOString() ?? null,
      rules_applied: {
        thresholds: ctx.thresholds,
        seats: ctx.seats,
        capacity: ctx.capacity,
        lifejackets: ctx.lifejackets,
        departure: input.departure.toISOString(),
        arrival: input.arrival.toISOString(),
        timeZone: ctx.timeZone,
      } as unknown as NonNullable<Json>,
      result,
      reasons: reasons as unknown as NonNullable<Json>,
      offline: !!opts.offline,
      client_id: opts.clientId ?? null,
    })
    .select("*")
    .single();
  if (error) throw fromDbError(error);
  return data;
}

export type SafetyCheckRow = Awaited<ReturnType<typeof runSafetyCheck>>;

async function getCheck(db: Db, ref: string) {
  const { data, error } = await db
    .from("safety_checks")
    .select("id, org_id, trip_id, result, reasons")
    .or(`id.eq.${ref},client_id.eq.${ref}`)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  return data;
}

export async function acknowledgeCheck(db: Db, me: Me, checkRef: string) {
  const check = await getCheck(db, checkRef);
  const { error } = await db
    .from("safety_acknowledgements")
    .upsert(
      { safety_check_id: check.id, org_id: check.org_id, acknowledged_by: me.userId },
      { onConflict: "safety_check_id", ignoreDuplicates: true },
    );
  if (error) throw fromDbError(error);
  return check.id;
}

/** The captain asks for an override; owners (and allowed managers) get WhatsApp and in-app. */
export async function requestOverride(db: Db, me: Me, checkRef: string, note?: string) {
  const check = await getCheck(db, checkRef);
  if (check.result !== "block") throw new ServiceError("invalid_transition");
  if (!canOverride(check.reasons as unknown as Reason[])) throw new ServiceError("not_overridable");
  const { data, error } = await db
    .from("safety_override_requests")
    .insert({
      org_id: check.org_id,
      trip_id: check.trip_id,
      safety_check_id: check.id,
      requested_by: me.userId,
      note: note ?? null,
    })
    .select("id")
    .single();
  if (error) throw error.code === "23505" ? new ServiceError("already_requested") : fromDbError(error);
  await notifyDeciders(supabaseAdmin(), check.org_id, check.trip_id, data.id, check.reasons as unknown as Reason[]);
  return data.id;
}

async function notifyDeciders(db: AdminDb, orgId: string, tripId: string, requestId: string, reasons: Reason[]) {
  const [{ data: org }, { data: members }] = await Promise.all([
    db.from("orgs").select("name, default_locale, settings").eq("id", orgId).single(),
    db
      .from("memberships")
      .select("user_id, role, profile:profiles!memberships_user_id_profiles_id_fk(phone_e164)")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("role", ["owner", "manager"]),
  ]);
  const managersToo = !!(org?.settings as { manager_can_override?: boolean } | null)?.manager_can_override;
  const deciders = (members ?? []).filter((m) => m.role === "owner" || managersToo);
  const locale = org && isLocale(org.default_locale) ? org.default_locale : defaultLocale;
  const t = createTranslator({ locale, messages: await loadMessages(locale) }) as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const why = reasons
    .filter((r) => r.severity === "block")
    .map((r) => t(`safety.reasons.${r.code}`, { value: String(r.value ?? ""), limit: String(r.limit ?? "") }))
    .join(" ");
  const link = `${serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/safety`;
  await db.from("notifications").insert(
    deciders.map((d) => ({
      org_id: orgId,
      user_id: d.user_id,
      template: "override_request",
      payload: { tripId, requestId, why },
    })),
  );
  for (const d of deciders) {
    if (!d.profile?.phone_e164) continue;
    // Button replies are handled by the WhatsApp webhook (M9); the link works today.
    await integrations()
      .messaging.send({
        channel: "whatsapp",
        kind: "interactive",
        toE164: d.profile.phone_e164,
        body: t("safety.whatsapp.request", { why, link }),
        buttons: [
          { id: `override:${requestId}:approved`, title: t("safety.whatsapp.approve") },
          { id: `override:${requestId}:declined`, title: t("safety.whatsapp.decline") },
        ],
      })
      .catch(() => null);
  }
}

export async function decideOverride(
  db: Db,
  me: Me,
  requestId: string,
  decision: "approved" | "declined",
  reason: string,
) {
  const { data: req, error } = await db
    .from("safety_override_requests")
    .select("id, org_id, trip_id, safety_check_id, requested_by, requested_at")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!req) throw new ServiceError("not_found");
  const { data, error: insError } = await db
    .from("safety_overrides")
    .insert({
      org_id: req.org_id,
      trip_id: req.trip_id,
      safety_check_id: req.safety_check_id,
      request_id: req.id,
      requested_by: req.requested_by,
      requested_at: req.requested_at,
      decided_by: me.userId,
      decision,
      reason,
    })
    .select("id")
    .single();
  if (insError) throw insError.code === "23505" ? new ServiceError("already_decided") : fromDbError(insError);
  return data.id;
}

/** Override requests with no decision yet (the owner's inbox). */
export async function pendingOverrides(db: Db, orgId: string) {
  const { data, error } = await db
    .from("safety_override_requests")
    .select(
      "id, trip_id, note, requested_at, requested_by, check:safety_checks(id, result, reasons, checked_at), decision:safety_overrides(id)",
    )
    .eq("org_id", orgId)
    .order("requested_at", { ascending: false });
  if (error) throw fromDbError(error);
  return data.filter((r) => !r.decision || (Array.isArray(r.decision) && r.decision.length === 0));
}

/** The latest check of a trip with its acknowledgement, request and decision (for screens). */
export async function latestSafety(db: Db, tripId: string) {
  const { data, error } = await db
    .from("safety_checks")
    .select(
      "id, client_id, result, reasons, checked_at, created_at, offline, weather_fetched_at, ack:safety_acknowledgements(acknowledged_at), request:safety_override_requests(id, requested_at, note), override:safety_overrides(decision, reason, decided_at)",
    )
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}

export async function listChecks(db: Db, tripId: string) {
  const { data, error } = await db
    .from("safety_checks")
    .select(
      "id, result, reasons, checked_at, offline, ack:safety_acknowledgements(acknowledged_at), override:safety_overrides(decision, reason, decided_at, decided_by)",
    )
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  return data;
}
