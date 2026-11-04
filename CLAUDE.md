# CLAUDE.md — Tideline

## What this is

A global vessel-operations platform for commercial boat and vessel operators. Launch market: Nigeria (Lagos ferries, Nigerian offshore support vessels). Everything country-specific is configuration, never hard-coded. Two modes on one shared core:

- Ferry mode: Lagos passenger boat operators. Manifests, ticketing, tracking, weather/night safety lock, documents.
- Charter mode: crew-boat and offshore support vessel (OSV) owners in oil and gas. AI tender packs, certificate expiry alerts, charter contracts, invoicing, spot-charter board.
- Shared core: organisations, vessels, documents/certificates, crew, trips, payments, AI assistant, WhatsApp bot.
  The full spec is in BUILD_SPEC.md. Read the relevant section before starting any milestone.

## Stack

- Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui
- Supabase: Postgres, Auth (phone OTP + email), Storage, Row Level Security, Edge Functions, pg_cron
- Drizzle ORM for schema; SQL migrations committed in /supabase/migrations
- Zod for all input validation; shared schemas in /src/lib/schemas
- Payments: PaymentProvider interface with a provider router per country/currency. Paystack and Flutterwave first (Nigeria, West Africa); Stripe later (USD and other markets)
- i18n: next-intl (ICU messages), locale per user; English first, French and Portuguese planned
- Messaging: WhatsApp Cloud API (primary), Termii (SMS + OTP fallback)
- Maps: Mapbox GL JS
- AI: LLM API behind an LlmClient interface; OCR via a vision-capable LLM or a document-OCR service behind an OcrClient interface; speech-to-text behind SttClient
- Weather: Open-Meteo (forecast + marine) behind a WeatherClient interface
- PWA: Workbox service worker, IndexedDB via Dexie for the offline queue
- Tests: Vitest (unit), Playwright (e2e), SQL tests for RLS
- Hosting: Vercel (web), Supabase (data). Sentry for errors.

## Commands

- pnpm dev — run locally
- pnpm db:migrate — apply migrations to local Supabase
- pnpm db:seed — load seed data (2 orgs, 4 vessels, crew, trips)
- pnpm test — unit tests
- pnpm test:e2e — Playwright
- pnpm lint && pnpm typecheck — must pass before any commit

## Rules

1. Every tenant table carries org_id. Every query is scoped by org. RLS is ON for every table. Never use the service-role key in client code.
2. Money is stored as integer minor units (bigint, column suffix _minor) with an ISO 4217 currency column on the same row (NGN, USD, ...). Never use floats. Never add amounts of different currencies.
3. Timestamps are timestamptz in UTC; display in the org's (or jetty's) IANA time zone, e.g. Africa/Lagos. Never hard-code a zone.
4. Phone numbers are stored in E.164 (+234..., +233..., ...); parse with libphonenumber using the org's country as default.
   4a. Country-specific rules (document types, regulators, cabotage rules, tax, safety defaults) come from the compliance module (BUILD_SPEC.md §16), keyed by country_code. Nigeria (NG) is the first rule set. No `if country === 'NG'` in business logic.
5. All external services sit behind an interface in /src/server/integrations/* with a fake implementation for tests and local dev. No vendor SDK calls outside these folders.
6. AI output is never final on its own. Extracted dates, amounts and drafted documents are saved with status 'needs_review' until a human confirms.
7. Safety lock checks and overrides are append-only audit records. Never update or delete them.
8. Captain/crew screens are offline-first: writes go to the IndexedDB outbox and sync with idempotency keys. Endpoints that accept offline writes must be idempotent (client_id unique per org).
9. Payment webhooks are signature-verified and idempotent (store provider event id). Never trust client-side payment status.
10. Personal data (passengers, crew) follows the data-protection rules in BUILD_SPEC.md §12 (NDPR/NDPA now; GDPR and others as markets open). Do not log phone numbers, names or ID numbers.
11. Keep captain screens light: target < 200 KB JS gzipped. Test on a throttled "Slow 3G" profile.
12. Plain English UI copy, short labels. No user-facing string in code: every string goes in /messages/{locale}.json via next-intl. Format numbers, money and dates with Intl using the user's locale.

## Structure

src/app/(public) marketing, passenger ticket pages, public charter board
src/app/(app) authenticated app: dashboard, vessels, crew, documents, trips, charters, invoices, settings
src/app/(captain) lightweight offline PWA screens for captains/crew
src/app/api route handlers (REST); webhooks under /api/webhooks/*
src/server services, domain logic, integrations, ai prompts
src/lib shared utils, zod schemas, money, dates, i18n helpers
src/server/compliance country rule sets (NG first) and the rules engine
messages/ i18n message files per locale
supabase/migrations SQL migrations
supabase/functions edge functions (cron jobs: expiry alerts, weather polling, idle vessels)
tests/ unit, e2e, rls

## Definition of done (every milestone)

- Migrations + RLS policies + seed updated
- Zod validation on every endpoint
- Unit tests for domain logic, at least one Playwright happy path
- lint, typecheck and tests pass
- Short note appended to /docs/CHANGELOG.md
