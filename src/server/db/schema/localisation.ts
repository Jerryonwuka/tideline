import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// §5.0 Countries, currencies and localisation (global reference data, admin-managed).

export const dataRegion = pgEnum("data_region", ["af", "eu", "us"]);
export const launchStatus = pgEnum("launch_status", ["planned", "validating", "pilot", "live"]);
export const paymentPurpose = pgEnum("payment_purpose", [
  "ticket",
  "subscription",
  "invoice",
  "charter_escrow",
  "payout",
]);
export const paymentProvider = pgEnum("payment_provider", ["paystack", "flutterwave", "stripe"]);

export const currencies = pgTable("currencies", {
  code: char("code", { length: 3 }).primaryKey(),
  minorUnitDigits: smallint("minor_unit_digits").notNull(),
  symbol: text("symbol").notNull(),
  enabled: boolean("enabled").notNull().default(false),
});

export const locales = pgTable("locales", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(false),
});

export const countries = pgTable("countries", {
  code: char("code", { length: 2 }).primaryKey(),
  name: text("name").notNull(),
  defaultCurrency: char("default_currency", { length: 3 })
    .notNull()
    .references(() => currencies.code),
  defaultLocale: text("default_locale")
    .notNull()
    .references(() => locales.code),
  defaultTimeZone: text("default_time_zone").notNull(),
  phonePrefix: text("phone_prefix").notNull(),
  /** Day-month order for dates written in numbers (OCR, §10.1): "DMY", "MDY" or "YMD". */
  dateOrder: text("date_order").notNull().default("DMY"),
  enabled: boolean("enabled").notNull().default(false),
  dataRegion: dataRegion("data_region").notNull(),
  launchStatus: launchStatus("launch_status").notNull().default("planned"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

/** For reporting only; never used to bill (§15). */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    base: char("base", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    quote: char("quote", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    rate: numeric("rate", { precision: 20, scale: 10 }).notNull(),
    asOf: date("as_of").notNull(),
    source: text("source").notNull(),
  },
  (t) => [uniqueIndex("exchange_rates_pair_day_key").on(t.base, t.quote, t.asOf)],
);

export const paymentProviderRoutes = pgTable(
  "payment_provider_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    currency: char("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    purpose: paymentPurpose("purpose").notNull(),
    provider: paymentProvider("provider").notNull(),
    priority: integer("priority").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [
    uniqueIndex("payment_routes_key").on(t.countryCode, t.currency, t.purpose, t.provider),
    index("payment_routes_lookup_idx")
      .on(t.countryCode, t.currency, t.purpose)
      .where(sql`enabled`),
  ],
);
