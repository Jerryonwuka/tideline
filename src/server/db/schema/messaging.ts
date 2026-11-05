import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { trips } from "./ferry";
import { vessels } from "./fleet";
import { orgs } from "./identity";
import { currencies } from "./localisation";

// §5.6 and §10.2: the WhatsApp bot (and SMS fallback). Phone numbers are stored only as hashes here.

export const messageDirection = pgEnum("message_direction", ["in", "out"]);
export const messageChannel = pgEnum("message_channel", ["whatsapp", "sms"]);
export const messageState = pgEnum("message_state", [
  "received",
  "awaiting_confirm",
  "confirmed",
  "cancelled",
  "failed",
]);
export const incidentStatus = pgEnum("incident_status", ["open", "acknowledged", "closed"]);
export const recordSource = pgEnum("record_source", ["app", "whatsapp_voice", "whatsapp_text", "sms"]);

export const waMessages = pgTable(
  "wa_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null until the sender is matched to an org. */
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    direction: messageDirection("direction").notNull(),
    channel: messageChannel("channel").notNull().default("whatsapp"),
    phoneHash: text("phone_hash").notNull(),
    /** Provider message id; each inbound message is handled once. */
    waMessageId: text("wa_message_id").notNull(),
    type: text("type").notNull(),
    mediaPath: text("media_path"),
    /** Text of the message or the voice-note transcript. Not kept for unknown senders. */
    transcript: text("transcript"),
    parsed: jsonb("parsed"),
    state: messageState("state").notNull().default("received"),
    linkedEntityType: text("linked_entity_type"),
    linkedEntityId: uuid("linked_entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("wa_messages_provider_id_key").on(t.channel, t.waMessageId),
    index("wa_messages_org_idx").on(t.orgId, t.createdAt),
  ],
);

/** One open conversation per person: the draft being completed and the question asked. */
export const botSessions = pgTable("bot_sessions", {
  userId: uuid("user_id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  channel: messageChannel("channel").notNull(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => waMessages.id, { onDelete: "cascade" }),
  draft: jsonb("draft").notNull(),
  /** The field the bot last asked for, if any. */
  asking: text("asking"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    vesselId: uuid("vessel_id").references(() => vessels.id, { onDelete: "set null" }),
    reportedBy: uuid("reported_by"),
    source: recordSource("source").notNull(),
    description: text("description").notNull(),
    urgent: boolean("urgent").notNull().default(false),
    status: incidentStatus("status").notNull().default("open"),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("incidents_org_idx").on(t.orgId, t.createdAt)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    vesselId: uuid("vessel_id").references(() => vessels.id, { onDelete: "set null" }),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    /** fuel, maintenance, wages, levy, other */
    category: text("category").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    paymentMethod: text("payment_method"),
    note: text("note"),
    source: recordSource("source").notNull(),
    recordedBy: uuid("recorded_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("expenses_org_idx").on(t.orgId, t.createdAt)],
);
