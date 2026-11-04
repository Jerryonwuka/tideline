import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { crewMembers, vessels } from "./fleet";
import { orgs } from "./identity";
import { countries, currencies } from "./localisation";

// §5.3 Ferry: jetties, routes, schedules, trips and manifests.

export const jettyStatus = pgEnum("jetty_status", ["proposed", "active"]);
export const tripStatus = pgEnum("trip_status", ["scheduled", "boarding", "departed", "arrived", "cancelled"]);
export const tripSource = pgEnum("trip_source", ["app", "whatsapp_voice", "whatsapp_text", "sms", "admin"]);
export const ageBand = pgEnum("age_band", ["child", "adult", "senior"]);

/** Global, admin-managed; orgs can propose new ones. */
export const jetties = pgTable(
  "jetties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    timeZone: text("time_zone").notNull(),
    name: text("name").notNull(),
    /** Local names people actually use ("CMS", "Marina"). */
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    adminArea: text("admin_area"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    status: jettyStatus("status").notNull().default("proposed"),
    proposedByOrgId: uuid("proposed_by_org_id").references(() => orgs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jetties_country_idx").on(t.countryCode)],
);

export const routes = pgTable(
  "routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    originJettyId: uuid("origin_jetty_id")
      .notNull()
      .references(() => jetties.id),
    destinationJettyId: uuid("destination_jetty_id")
      .notNull()
      .references(() => jetties.id),
    distanceKm: numeric("distance_km", { precision: 7, scale: 2 }),
    durationMin: integer("duration_min").notNull(),
    baseFareMinor: bigint("base_fare_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("routes_org_idx").on(t.orgId)],
);

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    vesselId: uuid("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday, in the origin jetty's time zone. */
    daysOfWeek: smallint("days_of_week").array().notNull(),
    departureTime: time("departure_time").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("schedules_org_idx").on(t.orgId)],
);

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    vesselId: uuid("vessel_id")
      .notNull()
      .references(() => vessels.id),
    captainCrewId: uuid("captain_crew_id").references(() => crewMembers.id, { onDelete: "set null" }),
    routeId: uuid("route_id").references(() => routes.id, { onDelete: "set null" }),
    scheduleId: uuid("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
    originText: text("origin_text"),
    destinationText: text("destination_text"),
    scheduledDeparture: timestamp("scheduled_departure", { withTimezone: true }),
    actualDeparture: timestamp("actual_departure", { withTimezone: true }),
    actualArrival: timestamp("actual_arrival", { withTimezone: true }),
    status: tripStatus("status").notNull().default("scheduled"),
    passengerCount: integer("passenger_count").notNull().default(0),
    lifejacketsConfirmed: boolean("lifejackets_confirmed").notNull().default(false),
    cargoNote: text("cargo_note"),
    takingsCashMinor: bigint("takings_cash_minor", { mode: "number" }).notNull().default(0),
    takingsDigitalMinor: bigint("takings_digital_minor", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    source: tripSource("source").notNull().default("app"),
    /** Offline idempotency key from the captain's phone (M5). */
    clientId: text("client_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("trips_org_client_key").on(t.orgId, t.clientId),
    uniqueIndex("trips_schedule_slot_key").on(t.scheduleId, t.scheduledDeparture),
    index("trips_org_departure_idx").on(t.orgId, t.scheduledDeparture),
    index("trips_vessel_idx").on(t.vesselId),
  ],
);

export const manifestEntries = pgTable(
  "manifest_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** Null for a "names to follow" walk-up count when the org allows it. */
    fullName: text("full_name"),
    phoneE164: text("phone_e164"),
    ageBand: ageBand("age_band"),
    sex: text("sex"),
    nextOfKinPhone: text("next_of_kin_phone"),
    seats: integer("seats").notNull().default(1),
    /** Ticket link arrives with M7. */
    ticketId: uuid("ticket_id"),
    boardedAt: timestamp("boarded_at", { withTimezone: true }),
    isAmendment: boolean("is_amendment").notNull().default(false),
    clientId: text("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("manifest_org_client_key").on(t.orgId, t.clientId), index("manifest_trip_idx").on(t.tripId)],
);

/** GPS points from the captain's phone while a trip is departed (§4.2 tracking). Append-only. */
export const tripPositions = pgTable(
  "trip_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    speedKn: doublePrecision("speed_kn"),
    accuracyM: doublePrecision("accuracy_m"),
    clientId: text("client_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trip_positions_org_client_key").on(t.orgId, t.clientId),
    index("trip_positions_trip_idx").on(t.tripId, t.recordedAt),
  ],
);
