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
  uniqueIndex,
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
    /** Off-platform charters: who the client is (no charterer org on Tideline). */
    clientName: text("client_name"),
    status: charterStatus("status").notNull().default("pending_contract"),
    /** Two-sided hire confirmations (§4.3, M13). */
    onHireOwnerAt: timestamp("on_hire_owner_at", { withTimezone: true }),
    onHireChartererAt: timestamp("on_hire_charterer_at", { withTimezone: true }),
    offHireOwnerAt: timestamp("off_hire_owner_at", { withTimezone: true }),
    offHireChartererAt: timestamp("off_hire_charterer_at", { withTimezone: true }),
    ...ts,
  },
  (t) => [index("charters_owner_idx").on(t.ownerOrgId), index("charters_charterer_idx").on(t.chartererOrgId)],
);

export const invoiceStatus = pgEnum("invoice_status", ["draft", "sent", "part_paid", "paid", "overdue", "void"]);

/** Global (org_id null) or an org's own; body uses {{variables}}. */
export const contractTemplates = pgTable("contract_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
  countryCode: char("country_code", { length: 2 }).references(() => countries.code),
  locale: text("locale").notNull().default("en"),
  name: text("name").notNull(),
  bodyTemplate: text("body_template").notNull(),
  variables: jsonb("variables").notNull().default([]),
  ...ts,
});

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerOrgId: uuid("owner_org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  chartererOrgId: uuid("charterer_org_id").references(() => orgs.id, { onDelete: "set null" }),
  charterId: uuid("charter_id")
    .notNull()
    .unique()
    .references(() => charters.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => contractTemplates.id),
  /** Rendered text both sides accept; locked once anyone has accepted. */
  bodyHtml: text("body_html").notNull(),
  bodyHash: text("body_hash").notNull(),
  pdfPath: text("pdf_path"),
  ownerAcceptedBy: uuid("owner_accepted_by"),
  ownerAcceptedAt: timestamp("owner_accepted_at", { withTimezone: true }),
  chartererAcceptedBy: uuid("charterer_accepted_by"),
  chartererAcceptedAt: timestamp("charterer_accepted_at", { withTimezone: true }),
  /** {owner: {name, ip, user_agent}, charterer: {...}} */
  acceptanceMeta: jsonb("acceptance_meta").notNull().default({}),
  ...ts,
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    charterId: uuid("charter_id").references(() => charters.id, { onDelete: "set null" }),
    number: text("number").notNull(),
    /** {name, org_id?, phone?, email?, address?} */
    billTo: jsonb("bill_to").notNull(),
    /** [{description, quantity, unit_minor, kind}] */
    lineItems: jsonb("line_items").notNull(),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    locale: text("locale").notNull().default("en"),
    subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }).notNull(),
    discountMinor: bigint("discount_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    taxMinor: bigint("tax_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    taxRuleCode: text("tax_rule_code"),
    taxRateBps: integer("tax_rate_bps"),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    amountPaidMinor: bigint("amount_paid_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    issueDate: date("issue_date").notNull().defaultNow(),
    dueDate: date("due_date"),
    status: invoiceStatus("status").notNull().default("draft"),
    pdfPath: text("pdf_path"),
    paymentLink: text("payment_link"),
    /** Unguessable token for the client's invoice page (no login). */
    publicToken: text("public_token").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    notes: text("notes"),
    ...ts,
  },
  (t) => [
    uniqueIndex("invoices_org_number_key").on(t.orgId, t.number),
    uniqueIndex("invoices_public_token_key").on(t.publicToken),
    index("invoices_status_idx").on(t.status, t.dueDate),
  ],
);

/** Per-org invoice number series, e.g. INV-2026-0001. */
export const invoiceSeries = pgTable("invoice_series", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => orgs.id, { onDelete: "cascade" }),
  prefix: text("prefix").notNull().default("INV"),
  year: integer("year").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
});

// ----- M13: escrow, payouts ---------------------------------------------------------------------

export const escrowStatus = pgEnum("escrow_status", ["held", "partially_released", "released", "refunded", "disputed"]);
export const payoutStatus = pgEnum("payout_status", ["pending", "success", "failed", "reversed"]);

/** Payee bank accounts: only the last 4 digits and the provider's recipient code are kept. */
export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  countryCode: char("country_code", { length: 2 })
    .notNull()
    .references(() => countries.code),
  currency: char("currency", { length: 3 })
    .notNull()
    .references(() => currencies.code),
  provider: text("provider").notNull(),
  bankCode: text("bank_code").notNull(),
  accountNumberLast4: char("account_number_last4", { length: 4 }).notNull(),
  accountName: text("account_name").notNull(),
  providerRecipientCode: text("provider_recipient_code").notNull(),
  verified: boolean("verified").notNull().default(false),
  ...ts,
});

/** Money the charterer paid into the platform, released to the owner by rule. */
export const escrowHolds = pgTable(
  "escrow_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payeeOrgId: uuid("payee_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    payerOrgId: uuid("payer_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").notNull().unique(),
    charterId: uuid("charter_id")
      .notNull()
      .references(() => charters.id, { onDelete: "cascade" }),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    releasedMinor: bigint("released_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    refundedMinor: bigint("refunded_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    status: escrowStatus("status").notNull().default("held"),
    /** {mobilisation: "on_hire", hire: "off_hire"} */
    releaseRule: jsonb("release_rule").notNull().default({ mobilisation: "on_hire", hire: "off_hire" }),
    /** Short history for screens (the full trail is audit_logs and ledger_entries). */
    events: jsonb("events").notNull().default([]),
    disputeReason: text("dispute_reason"),
    disputedBy: uuid("disputed_by"),
    ...ts,
  },
  (t) => [index("escrow_holds_charter_idx").on(t.charterId)],
);

/** Each release happens once per (hold, tranche): mobilisation, hire, or an admin resolution. */
export const escrowReleases = pgTable(
  "escrow_releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdId: uuid("hold_id")
      .notNull()
      .references(() => escrowHolds.id, { onDelete: "cascade" }),
    tranche: text("tranche").notNull(),
    grossMinor: bigint("gross_minor", { mode: "bigint" }).notNull(),
    commissionMinor: bigint("commission_minor", { mode: "bigint" }).notNull(),
    payoutMinor: bigint("payout_minor", { mode: "bigint" }).notNull(),
    refundMinor: bigint("refund_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    releasedBy: uuid("released_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("escrow_releases_tranche_key").on(t.holdId, t.tranche)],
);

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
  escrowHoldId: uuid("escrow_hold_id").references(() => escrowHolds.id),
  releaseId: uuid("release_id")
    .unique()
    .references(() => escrowReleases.id),
  currency: char("currency", { length: 3 })
    .notNull()
    .references(() => currencies.code),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  commissionMinor: bigint("commission_minor", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  /** Our transfer reference (sent to the provider, so a retry can't pay twice). */
  providerTransferRef: text("provider_transfer_ref").notNull().unique(),
  status: payoutStatus("status").notNull().default("pending"),
  initiatedBy: uuid("initiated_by"),
  failureReason: text("failure_reason"),
  ...ts,
});
