import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { routes, trips } from "./ferry";
import { orgs } from "./identity";
import { countries, currencies, paymentPurpose } from "./localisation";

// §5.5 Payments and billing, §11. Amounts are integer minor units with their currency on the same
// row; one flow never mixes currencies. Business code never names a provider (PaymentRouter).

/** How money arrived: a provider, or recorded by an agent. */
export const paymentMethod = pgEnum("payment_method", [
  "paystack",
  "flutterwave",
  "stripe",
  "fake",
  "cash",
  "transfer_manual",
]);
export const paymentStatus = pgEnum("payment_status", ["initiated", "success", "failed", "refunded"]);
export const feeBearer = pgEnum("fee_bearer", ["passenger", "operator"]);
export const ticketChannel = pgEnum("ticket_channel", ["online", "agent_cash", "agent_transfer"]);
export const ticketStatus = pgEnum("ticket_status", ["reserved", "paid", "used", "refunded", "cancelled"]);
export const planUnit = pgEnum("plan_unit", ["per_org", "per_vessel"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "read_only",
  "cancelled",
]);
export const ledgerAccount = pgEnum("ledger_account", ["escrow", "platform_revenue", "payee_payable", "provider_fees"]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The payee. */
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    payerUserId: uuid("payer_user_id"),
    payerOrgId: uuid("payer_org_id"),
    purpose: paymentPurpose("purpose").notNull(),
    referenceType: text("reference_type").notNull(),
    referenceId: uuid("reference_id").notNull(),
    provider: paymentMethod("provider").notNull(),
    /** Our reference, echoed back by the provider. */
    providerRef: text("provider_ref").notNull(),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    providerFeeMinor: bigint("provider_fee_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    platformFeeMinor: bigint("platform_fee_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    status: paymentStatus("status").notNull().default("initiated"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payments_provider_ref_key").on(t.providerRef),
    index("payments_reference_idx").on(t.referenceType, t.referenceId),
    index("payments_org_idx").on(t.orgId, t.createdAt),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    routeId: uuid("route_id").references(() => routes.id),
    passengerUserId: uuid("passenger_user_id"),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone"),
    qty: integer("qty").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }).notNull(),
    platformFeeMinor: bigint("platform_fee_minor", { mode: "bigint" }).notNull(),
    /** What the buyer pays (fee added when the passenger bears it). */
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    feeBearer: feeBearer("fee_bearer").notNull(),
    channel: ticketChannel("channel").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id),
    /** Short code printed and in the QR (no personal data in it). */
    code: text("code").notNull(),
    status: ticketStatus("status").notNull().default("reserved"),
    /** Seats are held this long while the buyer pays. */
    reservedUntil: timestamp("reserved_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tickets_code_key").on(t.code), index("tickets_trip_idx").on(t.tripId, t.status)],
);

/** Each provider event processed once. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.provider, t.eventId] })],
);

/** Platform fees in basis points (e.g. ticket_fee_bps), per country or default (null). */
export const feeConfig = pgTable(
  "fee_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    countryCode: char("country_code", { length: 2 }).references(() => countries.code),
    value: integer("value").notNull(),
    effectiveFrom: date("effective_from").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fee_config_key").on(t.key, t.countryCode, t.effectiveFrom)],
);

export const plans = pgTable("plans", {
  code: text("code").primaryKey(),
  nameKey: text("name_key").notNull(),
  unit: planUnit("unit").notNull(),
  /** "ferry" or "charter". */
  mode: text("mode").notNull(),
  limits: jsonb("limits").notNull().default({}),
});

export const planPrices = pgTable(
  "plan_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planCode: text("plan_code")
      .notNull()
      .references(() => plans.code),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    priceMinor: bigint("price_minor", { mode: "bigint" }).notNull(),
    countryCode: char("country_code", { length: 2 }).references(() => countries.code),
    activeFrom: date("active_from").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plan_prices_key").on(t.planCode, t.currency, t.countryCode, t.activeFrom)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    planCode: text("plan_code")
      .notNull()
      .references(() => plans.code),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    quantity: integer("quantity").notNull().default(1),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    status: subscriptionStatus("status").notNull().default("trialing"),
    providerSubscriptionRef: text("provider_subscription_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscriptions_org_plan_key").on(t.orgId, t.planCode)],
);

/** Double-entry style money trail; append-only. */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    account: ledgerAccount("account").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id),
    payoutId: uuid("payout_id"),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    debitMinor: bigint("debit_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    creditMinor: bigint("credit_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    memo: text("memo").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_payment_idx").on(t.paymentId)],
);

/** Settlement split per org and provider (e.g. a Paystack subaccount), when configured. */
export const orgSettlementAccounts = pgTable(
  "org_settlement_accounts",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subaccountCode: text("subaccount_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.provider] })],
);

/** What the daily reconcile-payments job couldn't match; the admin queue. */
export const reconciliationIssues = pgTable("reconciliation_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  detail: jsonb("detail").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});
