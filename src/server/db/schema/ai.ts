import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgs, profiles } from "./identity";

// §5.6 AI jobs and notifications.

export const aiJobKind = pgEnum("ai_job_kind", [
  "ocr_extract",
  "voice_log",
  "tender_parse",
  "tender_draft",
  "price_rationale",
  "weather_explain",
  "assistant",
]);
export const aiJobStatus = pgEnum("ai_job_status", ["queued", "done", "failed"]);

/** Every AI call: what ran, on what, with which prompt version, and what it cost (§10). */
export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    kind: aiJobKind("kind").notNull(),
    /** e.g. "document:<uuid>". */
    inputRef: text("input_ref").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model"),
    output: jsonb("output"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costEstimateMinor: bigint("cost_estimate_minor", { mode: "number" }),
    latencyMs: integer("latency_ms"),
    status: aiJobStatus("status").notNull().default("queued"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_jobs_org_created_idx").on(t.orgId, t.createdAt), index("ai_jobs_input_idx").on(t.inputRef)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("in_app"),
    /** i18n key under notifications.templates.* */
    template: text("template").notNull(),
    payload: jsonb("payload").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    status: text("status").notNull().default("sent"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.sentAt)],
);
