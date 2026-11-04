import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { trips } from "./ferry";
import { orgs } from "./identity";

// §4.2 Safety lock and §10.3 weather-risk flag. Checks, acknowledgements, override requests and
// decisions are append-only audit records (CLAUDE.md rule 7): UPDATE and DELETE are revoked.

export const safetyResult = pgEnum("safety_result", ["pass", "warn", "block"]);
export const overrideDecision = pgEnum("override_decision", ["approved", "declined"]);

/** Forecasts by location (rounded lat/lng), filled by the weather-poll job and on demand. Global. */
export const weatherCache = pgTable("weather_cache", {
  key: text("key").primaryKey(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validTo: timestamp("valid_to", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  data: jsonb("data").notNull(),
});

/** An org's own limits. They may only be stricter than the country defaults (database trigger). */
export const safetyThresholds = pgTable("safety_thresholds", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => orgs.id, { onDelete: "cascade" }),
  maxWindKmh: numeric("max_wind_kmh").notNull(),
  maxGustKmh: numeric("max_gust_kmh").notNull(),
  maxWaveM: numeric("max_wave_m").notNull(),
  maxPrecipMmH: numeric("max_precip_mm_h").notNull(),
  nightBlock: boolean("night_block").notNull().default(true),
  permittedStart: time("permitted_start"),
  permittedEnd: time("permitted_end"),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const safetyChecks = pgTable(
  "safety_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** When the check was made (the phone's time for offline checks). */
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    checkedBy: uuid("checked_by").notNull(),
    /** When the server stored it; a departure needs a check stored in the last hour. */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    weatherSnapshot: jsonb("weather_snapshot"),
    weatherFetchedAt: timestamp("weather_fetched_at", { withTimezone: true }),
    sunrise: timestamp("sunrise", { withTimezone: true }),
    sunset: timestamp("sunset", { withTimezone: true }),
    /** The thresholds and inputs the rules used. */
    rulesApplied: jsonb("rules_applied").notNull(),
    result: safetyResult("result").notNull(),
    /** [{code, severity, value?, limit?, overridable}] */
    reasons: jsonb("reasons")
      .notNull()
      .default(sql`'[]'::jsonb`),
    offline: boolean("offline").notNull().default(false),
    clientId: text("client_id"),
  },
  (t) => [
    uniqueIndex("safety_checks_org_client_key").on(t.orgId, t.clientId),
    index("safety_checks_trip_idx").on(t.tripId, t.createdAt),
  ],
);

/** A captain's "I understand" on a warn result. */
export const safetyAcknowledgements = pgTable("safety_acknowledgements", {
  safetyCheckId: uuid("safety_check_id")
    .primaryKey()
    .references(() => safetyChecks.id, { onDelete: "cascade" }),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  acknowledgedBy: uuid("acknowledged_by").notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
});

export const safetyOverrideRequests = pgTable(
  "safety_override_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    safetyCheckId: uuid("safety_check_id")
      .notNull()
      .references(() => safetyChecks.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [uniqueIndex("safety_override_requests_check_key").on(t.safetyCheckId)],
);

/** The owner's (or an allowed manager's) decision on a request; one per request, never edited. */
export const safetyOverrides = pgTable(
  "safety_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    safetyCheckId: uuid("safety_check_id")
      .notNull()
      .references(() => safetyChecks.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => safetyOverrideRequests.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    decidedBy: uuid("decided_by").notNull(),
    decision: overrideDecision("decision").notNull(),
    reason: text("reason").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("safety_overrides_request_key").on(t.requestId)],
);
