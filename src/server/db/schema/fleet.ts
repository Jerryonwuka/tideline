import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { appliesTo, documentTypes } from "./compliance";
import { orgs, profiles } from "./identity";
import { countries } from "./localisation";

// §5.2 Fleet, crew and documents.

export const vesselType = pgEnum("vessel_type", ["ferry", "crew_boat", "osv", "tug", "barge", "speedboat", "other"]);
export const vesselStatus = pgEnum("vessel_status", ["active", "maintenance", "idle", "on_charter", "laid_up"]);
export const crewRole = pgEnum("crew_role", ["captain", "engineer", "deckhand", "ticket_agent", "other"]);
export const crewStatus = pgEnum("crew_status", ["active", "inactive"]);
export const documentStatus = pgEnum("document_status", ["needs_review", "valid", "expiring", "expired", "rejected"]);
export const alertChannel = pgEnum("alert_channel", ["whatsapp", "sms", "email", "in_app"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
};

export const vessels = pgTable(
  "vessels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: vesselType("type").notNull(),
    flagCountryCode: char("flag_country_code", { length: 2 }).references(() => countries.code),
    /** Drives which compliance rule set applies. */
    operatingCountryCode: char("operating_country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    registrationNo: text("registration_no"),
    imo: text("imo"),
    mmsi: text("mmsi"),
    yearBuilt: smallint("year_built"),
    lengthM: numeric("length_m", { precision: 6, scale: 2 }),
    passengerCapacity: integer("passenger_capacity"),
    cargoCapacityT: numeric("cargo_capacity_t", { precision: 10, scale: 2 }),
    engine: text("engine"),
    /** Foreign key to jetties arrives with M4. */
    homeJettyId: uuid("home_jetty_id"),
    status: vesselStatus("status").notNull().default("active"),
    idleSince: timestamp("idle_since", { withTimezone: true }),
    ferryEnabled: boolean("ferry_enabled").notNull().default(false),
    charterEnabled: boolean("charter_enabled").notNull().default(false),
    /** §4.3 charter profile. */
    crewComplement: smallint("crew_complement"),
    speedKn: numeric("speed_kn", { precision: 5, scale: 1 }),
    deckSpaceM2: numeric("deck_space_m2", { precision: 8, scale: 1 }),
    dpClass: text("dp_class"),
    photos: text("photos")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [index("vessels_org_idx").on(t.orgId)],
);

export const crewMembers = pgTable(
  "crew_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** Set when the crew member also uses the app. */
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    phoneE164: text("phone_e164"),
    crewRole: crewRole("crew_role").notNull(),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    status: crewStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("crew_members_org_idx").on(t.orgId),
    uniqueIndex("crew_members_org_user_key")
      .on(t.orgId, t.userId)
      .where(sql`user_id is not null`),
  ],
);

export const vesselCrew = pgTable(
  "vessel_crew",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    vesselId: uuid("vessel_id")
      .notNull()
      .references(() => vessels.id, { onDelete: "cascade" }),
    crewMemberId: uuid("crew_member_id")
      .notNull()
      .references(() => crewMembers.id, { onDelete: "cascade" }),
    fromDate: date("from_date")
      .notNull()
      .default(sql`current_date`),
    toDate: date("to_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vessel_crew_vessel_idx").on(t.vesselId),
    // One open assignment per person per vessel.
    uniqueIndex("vessel_crew_open_key")
      .on(t.vesselId, t.crewMemberId)
      .where(sql`to_date is null`),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    subjectType: appliesTo("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    documentTypeCode: text("document_type_code")
      .notNull()
      .references(() => documentTypes.code),
    number: text("number"),
    issuer: text("issuer"),
    issueDate: date("issue_date"),
    expiryDate: date("expiry_date"),
    /** Path in the private "documents" storage bucket: {org}/{subject_type}/{subject_id}/{file}. */
    filePath: text("file_path"),
    status: documentStatus("status").notNull().default("needs_review"),
    /** AI extraction output (M3); never trusted until reviewed. */
    extracted: jsonb("extracted"),
    extractionConfidence: numeric("extraction_confidence", { precision: 4, scale: 3 }),
    reviewedBy: uuid("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    isPublic: boolean("is_public").notNull().default(false),
    replacedBy: uuid("replaced_by"),
    ...timestamps,
  },
  (t) => [
    index("documents_subject_idx").on(t.orgId, t.subjectType, t.subjectId),
    index("documents_expiry_idx").on(t.orgId, t.expiryDate),
  ],
);

export const documentAlerts = pgTable(
  "document_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    offsetDays: integer("offset_days").notNull(),
    channel: alertChannel("channel").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    detail: jsonb("detail"),
  },
  (t) => [uniqueIndex("document_alerts_once_key").on(t.documentId, t.offsetDays, t.channel)],
);
