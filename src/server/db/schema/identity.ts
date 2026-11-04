import { sql } from "drizzle-orm";
import { boolean, char, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// §5.1 Identity and organisation. RLS policies, functions and triggers live in hand-written
// SQL migrations next to the generated ones (supabase/migrations).

export const orgType = pgEnum("org_type", ["ferry_operator", "vessel_owner", "charterer", "barge_operator"]);
export const verificationStatus = pgEnum("verification_status", ["unverified", "pending", "verified"]);
export const membershipRole = pgEnum("membership_role", ["owner", "manager", "captain", "crew", "charterer"]);
export const membershipStatus = pgEnum("membership_status", ["active", "suspended"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
};

/** One row per auth user, created by a trigger on auth.users. */
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  phoneE164: text("phone_e164").unique(),
  email: text("email"),
  locale: text("locale"),
  /** Null = use the org's zone. */
  timeZone: text("time_zone"),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  ...timestamps,
});

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** ISO 3166-1 alpha-2. Foreign key to countries and the currency/zone/locale defaults arrive in M1b. */
  countryCode: char("country_code", { length: 2 }).notNull(),
  name: text("name").notNull(),
  type: orgType("type").notNull(),
  registrationNumber: text("registration_number"),
  address: text("address"),
  region: text("region"),
  modes: text("modes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  verificationStatus: verificationStatus("verification_status").notNull().default("unverified"),
  subscriptionStatus: text("subscription_status"),
  /** alert_offsets, fee_bearer, permitted_hours, manager_can_override, require_passenger_names. */
  settings: jsonb("settings")
    .notNull()
    .default(sql`'{}'::jsonb`),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    status: membershipStatus("status").notNull().default("active"),
    invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("memberships_user_org_key").on(t.userId, t.orgId), index("memberships_org_idx").on(t.orgId)],
);

export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    phoneE164: text("phone_e164").notNull(),
    role: membershipRole("role").notNull(),
    /** SHA-256 hex of the token in the invite link. The token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => profiles.id, { onDelete: "set null" }),
    invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    // One open invitation per phone per org.
    uniqueIndex("invitations_open_phone_key")
      .on(t.orgId, t.phoneE164)
      .where(sql`accepted_at is null`),
  ],
);
