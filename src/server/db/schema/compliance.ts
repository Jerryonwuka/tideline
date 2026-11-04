import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { countries } from "./localisation";
import { profiles } from "./identity";

// §16 Country compliance module: every country's regulation as data. A rule set with no
// country is the global baseline that applies everywhere.

export const ruleSetStatus = pgEnum("rule_set_status", ["draft", "published", "retired"]);
export const regulatorScope = pgEnum("regulator_scope", ["national", "state", "port"]);
export const appliesTo = pgEnum("applies_to", ["vessel", "crew", "org"]);
export const ruleSeverity = pgEnum("rule_severity", ["block", "warn"]);

export const complianceRuleSets = pgTable(
  "compliance_rule_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null = global baseline. */
    countryCode: char("country_code", { length: 2 }).references(() => countries.code),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    status: ruleSetStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
    legalReviewNote: text("legal_review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Uniqueness of (country, version) and "one published per country" treat the global set (null
  // country) as a value; they are expression indexes in the hand-written m1b migration.
);

export const regulators = pgTable("regulators", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleSetId: uuid("rule_set_id")
    .notNull()
    .references(() => complianceRuleSets.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  scope: regulatorScope("scope").notNull(),
  website: text("website"),
});

export const documentTypes = pgTable("document_types", {
  code: text("code").primaryKey(),
  /** Null = global type. */
  ruleSetId: uuid("rule_set_id").references(() => complianceRuleSets.id, { onDelete: "cascade" }),
  /** i18n key under documentTypes.* */
  nameKey: text("name_key").notNull(),
  appliesTo: appliesTo("applies_to").notNull(),
  issuerName: text("issuer_name"),
  defaultValidityMonths: integer("default_validity_months"),
});

export const documentRequirements = pgTable(
  "document_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => complianceRuleSets.id, { onDelete: "cascade" }),
    documentTypeCode: text("document_type_code")
      .notNull()
      .references(() => documentTypes.code),
    appliesTo: appliesTo("applies_to").notNull(),
    /** Empty = every vessel type. */
    vesselTypes: text("vessel_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Empty = whatever modes the vessel runs. */
    modes: text("modes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    mandatory: boolean("mandatory").notNull().default(true),
    regulatorId: uuid("regulator_id").references(() => regulators.id, { onDelete: "set null" }),
    /** Overrides the org's alert offsets for this document, in days. */
    alertOffsets: integer("alert_offsets").array(),
  },
  (t) => [index("document_requirements_rule_set_idx").on(t.ruleSetId)],
);

export const charterEligibilityRules = pgTable("charter_eligibility_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleSetId: uuid("rule_set_id")
    .notNull()
    .references(() => complianceRuleSets.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  descriptionKey: text("description_key").notNull(),
  /** Declarative check, e.g. {"requires_documents": ["cabotage_registration"]}. */
  check: jsonb("check").notNull(),
  severity: ruleSeverity("severity").notNull(),
});

export const safetyRuleDefaults = pgTable("safety_rule_defaults", {
  ruleSetId: uuid("rule_set_id")
    .primaryKey()
    .references(() => complianceRuleSets.id, { onDelete: "cascade" }),
  maxWindKmh: numeric("max_wind_kmh").notNull(),
  maxGustKmh: numeric("max_gust_kmh").notNull(),
  maxWaveM: numeric("max_wave_m").notNull(),
  maxPrecipMmH: numeric("max_precip_mm_h").notNull().default("10"),
  nightBlock: boolean("night_block").notNull().default(true),
  permittedStart: time("permitted_start"),
  permittedEnd: time("permitted_end"),
});

export const taxRules = pgTable("tax_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleSetId: uuid("rule_set_id")
    .notNull()
    .references(() => complianceRuleSets.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  rateBps: integer("rate_bps").notNull(),
  appliesTo: text("applies_to").notNull(),
  labelKey: text("label_key").notNull(),
});
