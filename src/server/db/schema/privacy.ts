import { sql } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./identity";

// §12 (M16) data protection: consents, data-subject requests, logged admin access to passenger data,
// feature flags and app-level rate limits.

export const consentPurpose = pgEnum("consent_purpose", ["privacy_notice", "marketing", "optional_fields"]);

/** Append-only: the latest row per person and purpose is the current choice. */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    /** For people without an account (e.g. ticket buyers): HMAC of the phone number, never the number. */
    phoneHash: text("phone_hash"),
    purpose: consentPurpose("purpose").notNull(),
    granted: boolean("granted").notNull(),
    noticeVersion: text("notice_version").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consents_user_idx").on(t.userId), index("consents_phone_idx").on(t.phoneHash)],
);

export const dataRequestKind = pgEnum("data_request_kind", ["export", "delete"]);
export const dataRequestStatus = pgEnum("data_request_status", ["pending", "completed", "rejected"]);

export const dataRequests = pgTable(
  "data_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null once the person's account has been erased (the request itself is kept as a record). */
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    kind: dataRequestKind("kind").notNull(),
    status: dataRequestStatus("status").notNull().default("pending"),
    dueAt: timestamp("due_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    exportPath: text("export_path"),
    note: text("note"),
    handledBy: uuid("handled_by"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("data_requests_status_idx").on(t.status, t.dueAt)],
);

/** Every platform-admin read of passenger data, with the reason given. Append-only. */
export const adminAccessLogs = pgTable("admin_access_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  reason: text("reason").notNull(),
  rowsReturned: integer("rows_returned").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
  description: text("description").notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fixed-window counters for abuse limits (keys are hashed; no raw phone numbers or IPs). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
