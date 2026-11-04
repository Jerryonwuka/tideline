import { index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./identity";

// §8 Offline sync: every op a phone sends is recorded once per (org, client_id), so replaying a
// batch returns the first outcome instead of applying it again.

export const syncOpStatus = pgEnum("sync_op_status", ["applied", "conflict", "rejected"]);

export const syncOps = pgTable(
  "sync_ops",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id").notNull(),
    op: text("op").notNull(),
    status: syncOpStatus("status").notNull(),
    /** Server id of the row the op created or touched, and the error code when not applied. */
    result: jsonb("result").notNull().default({}),
    /** When the phone recorded it (client clock), and when the server processed it. */
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.clientId] }), index("sync_ops_user_idx").on(t.userId, t.processedAt)],
);
