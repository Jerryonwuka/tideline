import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { vessels } from "./fleet";
import { orgs } from "./identity";
import { countries, currencies } from "./localisation";

// §5.4 Charter (M11: listings, requests, quotes; charters are created on acceptance and carried on
// by contracts, hire and invoicing in M12–M13). Charter tables have two sides, owner_org_id and
// charterer_org_id; RLS lets members of either side see what concerns them.

export const listingStatus = pgEnum("listing_status", ["draft", "live", "paused"]);
export const requestStatus = pgEnum("charter_request_status", ["open", "quoted", "accepted", "declined", "expired"]);
export const quoteStatus = pgEnum("charter_quote_status", ["sent", "accepted", "declined", "expired"]);
export const charterStatus = pgEnum("charter_status", [
  "pending_contract",
  "pending_payment",
  "active",
  "completed",
  "disputed",
  "cancelled",
]);

const ts = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const charterListings = pgTable(
  "charter_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    vesselId: uuid("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    dayRateMinor: bigint("day_rate_minor", { mode: "bigint" }).notNull(),
    /** The lowest the owner will go (private; never shown on the board). */
    minRateMinor: bigint("min_rate_minor", { mode: "bigint" }),
    minDays: integer("min_days").notNull().default(1),
    operatingArea: text("operating_area").notNull(),
    availableFrom: date("available_from"),
    availableTo: date("available_to"),
    description: text("description"),
    status: listingStatus("status").notNull().default("draft"),
    suggestedRateMinor: bigint("suggested_rate_minor", { mode: "bigint" }),
    suggestionInputs: jsonb("suggestion_inputs"),
    /** The only documents shown publicly with the listing. */
    publicDocumentIds: uuid("public_document_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    ...ts,
  },
  (t) => [index("charter_listings_status_idx").on(t.status), index("charter_listings_org_idx").on(t.orgId)],
);

export const charterRequests = pgTable(
  "charter_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chartererOrgId: uuid("charterer_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** Null for open requests to any owner. */
    ownerOrgId: uuid("owner_org_id").references(() => orgs.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").references(() => charterListings.id, { onDelete: "set null" }),
    requestedBy: uuid("requested_by"),
    vesselType: text("vessel_type"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    location: text("location").notNull(),
    countryCode: char("country_code", { length: 2 }).references(() => countries.code),
    purpose: text("purpose").notNull(),
    crewNeeds: text("crew_needs"),
    budgetMinor: bigint("budget_minor", { mode: "bigint" }),
    currency: char("currency", { length: 3 }).references(() => currencies.code),
    status: requestStatus("status").notNull().default("open"),
    ...ts,
  },
  (t) => [
    index("charter_requests_owner_idx").on(t.ownerOrgId),
    index("charter_requests_charterer_idx").on(t.chartererOrgId),
  ],
);

export const charterQuotes = pgTable(
  "charter_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerOrgId: uuid("owner_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => charterRequests.id, { onDelete: "cascade" }),
    vesselId: uuid("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    dayRateMinor: bigint("day_rate_minor", { mode: "bigint" }).notNull(),
    mobilisationMinor: bigint("mobilisation_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    /** fuel terms, payment terms, notes. */
    terms: jsonb("terms").notNull().default({}),
    validUntil: date("valid_until").notNull(),
    status: quoteStatus("status").notNull().default("sent"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...ts,
  },
  (t) => [index("charter_quotes_request_idx").on(t.requestId)],
);

export const charters = pgTable(
  "charters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerOrgId: uuid("owner_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** Null for off-platform charters recorded for invoicing. */
    chartererOrgId: uuid("charterer_org_id").references(() => orgs.id, { onDelete: "set null" }),
    vesselId: uuid("vessel_id")
      .notNull()
      .references(() => vessels.id),
    quoteId: uuid("quote_id").references(() => charterQuotes.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    onHireAt: timestamp("on_hire_at", { withTimezone: true }),
    offHireAt: timestamp("off_hire_at", { withTimezone: true }),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    governingCountryCode: char("governing_country_code", { length: 2 }).references(() => countries.code),
    dayRateMinor: bigint("day_rate_minor", { mode: "bigint" }).notNull(),
    mobilisationMinor: bigint("mobilisation_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    totalValueMinor: bigint("total_value_minor", { mode: "bigint" }).notNull(),
    commissionBps: integer("commission_bps").notNull().default(0),
    bookedOnPlatform: boolean("booked_on_platform").notNull().default(true),
    status: charterStatus("status").notNull().default("pending_contract"),
    ...ts,
  },
  (t) => [index("charters_owner_idx").on(t.ownerOrgId), index("charters_charterer_idx").on(t.chartererOrgId)],
);
