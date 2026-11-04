import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** §5.6 append-only audit trail. Rows are written by database triggers; UPDATE and DELETE are blocked. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** No foreign key: the trail must outlive the org. */
    orgId: uuid("org_id"),
    /** Null when the change came from the platform itself (service role, jobs). */
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ip: text("ip"),
    at: timestamp("at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("audit_logs_org_at_idx").on(t.orgId, t.at), index("audit_logs_entity_idx").on(t.entity, t.entityId)],
);
