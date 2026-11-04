# [Company Name] — MVP Build Specification

> Hand this file to Claude Code. Part A is a `CLAUDE.md` you can copy into the repo root. Part B is the full product and technical spec. Part C is the ordered milestone plan, written as prompts to paste into Claude Code one at a time.
>
> Positioning: a global vessel-operations platform. Nigeria (Lagos ferries and the Nigerian offshore support sector) is the launch market. Build every country-, currency-, language- and time-zone-specific value as configuration from day one, even though only Nigeria is switched on at launch.
>
> Owner: Jerry Onwuka (Abuja, Nigeria). Status: MVP spec, November 2026. Prices and volumes are business assumptions; they appear here only where the software must support them (for example, configurable fee rates).

---

## Contents

- Part A — CLAUDE.md (project memory for Claude Code)
- Part B — Product and technical specification
  1. Product summary
  2. Scope by phase
  3. User roles and permissions
  4. Features in detail
  5. Data model
  6. API endpoints
  7. Recommended stack
  8. Mobile, PWA and offline approach
  9. Screens and user flows
  10. AI features: prompts and logic
  11. Payments, escrow and fees
  12. Security, data protection and data residency (NDPR/NDPA, GDPR)
  13. Testing
  14. Deployment and environments
  15. Multi-country, multi-currency, languages and time zones
  16. Country compliance module
- Part C — Milestone plan (ordered Claude Code prompts with acceptance criteria)
- Appendix — Open decisions for the founder

---

# Part A — CLAUDE.md

Copy the block below into `CLAUDE.md` at the repository root.

```markdown
# CLAUDE.md — [Company Name]

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
src/app/(public)        marketing, passenger ticket pages, public charter board
src/app/(app)           authenticated app: dashboard, vessels, crew, documents, trips, charters, invoices, settings
src/app/(captain)       lightweight offline PWA screens for captains/crew
src/app/api             route handlers (REST); webhooks under /api/webhooks/*
src/server              services, domain logic, integrations, ai prompts
src/lib                 shared utils, zod schemas, money, dates, i18n helpers
src/server/compliance   country rule sets (NG first) and the rules engine
messages/               i18n message files per locale
supabase/migrations     SQL migrations
supabase/functions      edge functions (cron jobs: expiry alerts, weather polling, idle vessels)
tests/                  unit, e2e, rls

## Definition of done (every milestone)
- Migrations + RLS policies + seed updated
- Zod validation on every endpoint
- Unit tests for domain logic, at least one Playwright happy path
- lint, typecheck and tests pass
- Short note appended to /docs/CHANGELOG.md
```

---

# Part B — Product and technical specification

## 1. Product summary

[Company Name] is a global vessel-operations platform: one web app (installable as a PWA) plus a WhatsApp bot. It launches in Nigeria; the code is multi-country from day one (§15, §16). An organisation (a ferry company, a vessel-owning company or a charterer) signs up, adds its vessels, crew and documents, and turns on the modes it needs: Ferry, Charter or both.

Core loops:

- **Ferry loop:** captain opens trip → safety lock checks weather, time, capacity and documents → passengers added to manifest / tickets sold → trip departs and is tracked → trip closes with passenger count and takings → owner sees a daily report.
- **Charter loop:** owner uploads certificates → AI extracts expiry dates → alerts before expiry → owner builds tender packs from stored documents → idle vessel listed on spot-charter board → charterer requests → quote → contract → escrow payment → hire tracked → invoice → payout.

## 2. Scope by phase

| Phase | Timing (estimate) | In scope |
|---|---|---|
| **Phase 1 — Core + Ferry MVP** | Months 1–4 | Auth and organisations; roles; vessels; crew; documents and certificates with OCR + expiry alerts; trips; ferry routes and schedules; manifests; ticketing (Paystack + cash recording); safety lock (weather + night); live tracking (captain phone GPS); WhatsApp voice-note logging; owner dashboard and daily report; offline PWA for captains; basic admin console. |
| **Phase 2 — Charter mode** | Months 3–8 | Charter vessel profiles; AI tender-pack builder; charter requests and quotes; charter contracts (templates + in-app acceptance); escrow payments; invoicing; payouts; spot-charter board (public + charterer accounts); idle-vessel pricing and buyer suggestions; ratings. |
| **Phase 3 — Corridor and marketplace** | Months 9–12 | Barge profiles; cargo load postings and load-matching on the Lagos–Onitsha and Warri corridors; escrowed load payments; public rental marketplace (consumer listings, booking, reviews). |
| **Phase 4 — International expansion** | After Nigeria goals are met (estimate) | Second payment provider (Stripe); USD and local-currency price books live; French and Portuguese; new country rule sets in the order of the expansion roadmap: West Africa (Ghana, Côte d'Ivoire, Cameroon), then East Africa (Kenya, Tanzania, Lake Victoria), Southeast Asia (Philippines, Indonesia), the Gulf of Mexico and other offshore-energy hubs, and Brazil. Each market's details must be validated before its rule set is built. |
| Out of scope for MVP | — | Native iOS/Android apps, AIS hardware integration, regulator dashboard, insurance products. |

Multi-country, multi-currency, i18n and time-zone support are **in scope from Phase 1** as foundations (data model, config, abstractions), with only Nigeria, NGN (plus USD price book) and English switched on at launch.

Phases 1 and 2 overlap. Certificate OCR and expiry alerts ship in Phase 1 because they are part of the shared core and are what crew-boat owners pay for first.

## 3. User roles and permissions

Roles are per organisation membership (`memberships.role`). One user can belong to several organisations.

| Role | Who | Can do | Cannot do |
|---|---|---|---|
| `owner` | Business owner | Everything in their org: billing, subscriptions, members, payouts, bank accounts, all data; approve safety overrides (logged) | Platform admin actions |
| `manager` | Operations / fleet manager | Vessels, crew, documents, routes, schedules, trips, charters, invoices, tender packs; approve safety override only if the owner allows it in settings | Change billing, bank accounts, payouts; delete org |
| `captain` | Boat captain / master | Own assigned trips: open/close trip, manifest, tickets, tracking, voice notes, request safety override; view own vessel's documents | See finances beyond own trips; edit vessels; see other crew's private data |
| `crew` | Deckhand, ticket agent | Add passengers / sell and scan tickets on assigned trips; view own certificates | Open/close trips; request overrides |
| `passenger` | Public user (no org membership) | Buy tickets, view own tickets and trip status, add an emergency contact | Any org data |
| `charterer` | User in a charterer org | Browse board, request charters, accept quotes and contracts, pay into escrow, confirm on-hire/off-hire, rate owners | See an owner's private documents unless shared in a listing or tender pack |
| `admin` | [Company Name] staff | Verify orgs and documents, resolve disputes, release/refund escrow on dispute, manage fee config, safety defaults, countries, currencies and compliance rule sets, view audit logs | Read passenger data without a logged reason |

Implementation: `memberships(user_id, org_id, role)`; RLS policies call a `has_role(org_id, roles[])` SQL function using `auth.uid()`. Admins live in a separate `platform_admins` table checked by `is_platform_admin()`.

## 4. Features in detail

### 4.1 Shared core

**Organisations and onboarding**
- Sign up by phone OTP (Termii in Nigeria; OTP provider chosen per country) or email. Create org: country, name, type (`ferry_operator`, `vessel_owner`, `charterer`, `barge_operator`), registration number (CAC in Nigeria; label and format from the country config), address, region/state, modes enabled. Country sets the defaults for currency, time zone, locale and compliance rule set; the owner can change currency and locale.
- Invite members by phone; invitation sent by WhatsApp (SMS fallback) with a link.
- Org verification status (`unverified`, `pending`, `verified`) set by admin after a document check. Verified orgs get a badge on the board.

**Vessels**
- Fields: name, type (ferry, crew boat, OSV, tug, barge, speedboat, other), registration no., IMO and MMSI (optional), flag, year built, length, passenger capacity, deck cargo capacity (tonnes), engine, home jetty/port, photos, status (`active`, `maintenance`, `idle`, `on_charter`, `laid_up`).
- Mode flags: `ferry_enabled`, `charter_enabled`.
- Vessel page tabs: overview, documents with expiry status, crew, trips, charters, earnings.

**Documents and certificates**
- Upload a photo/PDF in the app or send it to the WhatsApp bot.
- OCR + AI extraction: document type, number, issuer, issue date, expiry date, holder (vessel or crew). Saved as `needs_review`; owner/manager confirms or edits (§10.1).
- Document types come from the compliance module (§16): global types (class certificate, insurance, load line, radio licence, STCW, medical, ID, other) plus country types. Nigeria rule set (first): vessel registration, LASWA licence, NIMASA certificate, Cabotage registration, safety equipment certificate, crew competency.
- Expiry alerts at 90, 60, 30, 14, 7 and 1 days before expiry and on the expiry day (configurable per org). Channels: WhatsApp, SMS fallback, email, in-app.
- Compliance score per vessel = valid required documents ÷ required documents for the vessel's enabled modes.

**Crew**
- Profile: name, phone, crew role (captain, engineer, deckhand, ticket agent), certificates, emergency contact, assigned vessels, status.
- Crew can be invited as app users (captain/crew role) or kept as records only.

**Trips**
- Shared trip record for both modes: vessel, captain, route or origin/destination, scheduled and actual times, status (`scheduled`, `boarding`, `departed`, `arrived`, `cancelled`), passenger count, cargo note, takings, source (`app`, `whatsapp_voice`, `whatsapp_text`, `sms`, `admin`).

**Payments**
- One `payments` table for tickets, subscriptions, invoices and escrow, plus payouts. See §11.

**AI assistant**
- In-app chat and WhatsApp bot. Read tools: vessel status, expiring documents, today's takings, trips, idle vessels. Draft tools: trip log, invoice, tender pack, price suggestion. See §10.6.

### 4.2 Ferry mode

**Routes and schedules**
- Route: origin jetty, destination jetty, distance (km), typical duration, base fare (minor units, route currency), active flag. Jetties have coordinates and aliases (local names).
- Schedules: recurring departures (days of week + time) or ad-hoc trips.

**Manifests**
- Add passenger: name, phone (optional), age band, sex (optional), next-of-kin phone (optional), seats. Quick-add for walk-ups (count only, "names to follow") only if the org allows it.
- Capacity guard: cannot add beyond vessel passenger capacity. Hard block; no override.
- Life-jacket confirmation checkbox per trip.
- Manifest locks at departure; later edits are logged amendments.
- Works offline and syncs.

**Ticketing**
- Channels: (a) passenger buys online via public link or QR at the jetty (Paystack: card, bank transfer, USSD); (b) agent sells at the jetty and records cash or transfer; (c) agent generates a payment link for transfer.
- Each ticket has a short code and QR; the agent scans or types it at boarding, which marks the manifest entry.
- Platform fee: configurable basis points (default 100 = 1%; country overrides allowed) on online tickets; fee bearer (`passenger` or `operator`) set per org.
- Daily report per vessel/route: tickets, cash vs. digital, passenger count, fees.

**Tracking**
- The captain's phone sends GPS points every 30 s while a trip is `departed` and the screen is on. Points are queued offline and uploaded on reconnect.
- Owner live map (Mapbox): vessels, last-seen time, trip status; trip track replay.
- Public trip status page for passengers (departed/arrived, rough ETA); no personal data.

**Safety lock**
Before a trip can move to `departed`, the system runs four checks:
1. **Weather:** forecast at origin and route midpoint for the departure→arrival window (wind speed, gusts, wave height, precipitation, visibility/weather code where available) against thresholds. Platform defaults are set by admin; an org may make them stricter, never looser.
2. **Night:** departure or estimated arrival after sunset or before sunrise at the jetty, or outside the org's permitted hours.
3. **Capacity and life jackets:** manifest count ≤ capacity; life-jacket box ticked.
4. **Documents:** vessel licence and captain competency not expired.

Result is `pass`, `warn` or `block`:
- `warn`: captain must acknowledge before departing.
- `block`: depart is disabled. The captain can request an override; the owner (or a manager, if allowed) approves or declines with a reason, from the app or a WhatsApp button. Stored in `safety_checks` and `safety_overrides` (append-only). Capacity breaches can never be overridden.
- Offline: if cached weather is older than 3 hours, the weather part returns `warn: weather unknown`; night, capacity and document checks still run on the device.

**WhatsApp voice-note logging**
- Captain sends a voice note to the bot, e.g. "Trip four from CMS to Ikorodu, eighteen passengers, twenty-seven thousand naira".
- Pipeline: download media → speech-to-text → LLM extracts a structured log → bot replies with a summary and [Confirm] [Edit] [Cancel] → on Confirm, trip saved with `source = whatsapp_voice`.
- Also handles text messages and expense notes ("Fuel 40k").

### 4.3 Charter mode

**Charter vessel profile**
- Extra fields: day rate (minor units, listing currency), minimum hire days, operating area, crew complement, speed, deck space, DP class (if any), availability calendar, public listing flag, documents chosen for public display.

**AI tender-pack builder**
- Input: tender document (PDF upload or pasted text) or a saved checklist template.
- AI parses requirements into a checklist; code maps each item to stored documents; flags missing or soon-to-expire items; AI drafts a cover letter, company profile, vessel specification sheet and HSE statement from stored data only.
- Output: merged PDF with an index page, plus a ZIP of source files. Status `draft` → `reviewed` → `exported`. Owner must review before export (§10.5).

**Charter requests, quotes and contracts**
- Charterer submits a request: vessel type, dates, location, purpose, crew needs, budget (optional).
- Owner replies with a quote (day rate, mobilisation fee, fuel terms, payment terms, validity). Charterer accepts.
- Contract generated from a template with variables; both parties accept in-app (name, timestamp, IP stored); PDF saved.
- Off-platform charters can be recorded for invoicing only (`booked_on_platform = false`, no commission).

**Invoicing**
- Invoice from a charter (days on hire × day rate + extras − discounts + VAT if the org is VAT-registered) or manual. Number series per org. PDF. Send by WhatsApp or email. Status `draft`, `sent`, `part_paid`, `paid`, `overdue`.
- Paid by payment link or escrow release.

**Spot-charter board**
- Public list of available vessels with filters (type, area, dates, capacity). Shows verified badge and compliance score; never shows private documents.
- Charterer login required to send a request.
- Commission: configurable basis points (default range 500–1000 = 5–10%, set by admin) on charters booked and paid through the platform.
- In-app payment incentive: configurable reduction of the commission or a discount when paid through escrow.

**Idle-vessel pricing and buyer suggestions**
- When a vessel is `idle` for N days (default 3), the system suggests a day rate and a ranked list of likely charterers. The owner can publish to the board with one tap (§10.4).

### 4.4 Admin console
- Orgs and verification queue; document review queue (flagged OCR); disputes and escrow holds; fee configuration; safety threshold defaults; jetty list; audit log viewer; feature flags.

### 4.5 Phase 3 (outline; detail later)
- **Barge load-matching:** shippers post loads (cargo type, tonnes, origin, destination on the Lagos–Onitsha or Warri corridor, dates, target price). Barge owners bid; match accepted; payment held in escrow; release on delivery confirmation (photo + geotag + receiver OTP).
- **Public rental marketplace:** consumer listings, date booking, deposits, reviews, cancellation policy.

## 5. Data model

Postgres (Supabase). Unless marked *(global)*, every table has `id uuid pk default gen_random_uuid()`, `org_id uuid not null references orgs`, `created_at timestamptz default now()`, `updated_at timestamptz`. Money columns are `bigint` minor units (suffix `_minor`; kobo for NGN, cents for USD) and every table with money has a `currency char(3)` column. Enums are Postgres enums.

### 5.0 Countries, currencies and localisation (new)
| Table | Fields |
|---|---|
| `countries` *(global)* | code char(2) pk (ISO 3166-1), name, default_currency, default_locale, default_time_zone, phone_prefix, enabled bool, compliance_rule_set_id, data_region enum(af, eu, us, ...), launch_status enum(planned, validating, pilot, live) |
| `currencies` *(global)* | code char(3) pk (ISO 4217), minor_unit_digits int, symbol, enabled bool |
| `exchange_rates` *(global)* | base, quote, rate numeric, as_of, source — for reporting only; never used to bill |
| `locales` *(global)* | code (en, en-NG, fr, pt-BR, ...), name, enabled |
| `payment_provider_routes` *(global)* | country_code, currency, purpose (ticket, subscription, escrow, payout), provider, priority, enabled |

### 5.1 Identity and organisation
| Table | Fields |
|---|---|
| `profiles` *(global)* | id (= auth.users.id), full_name, phone_e164, email, locale, time_zone (nullable = org default), whatsapp_opt_in bool |
| `orgs` *(global)* | id, country_code → countries, currency, time_zone, default_locale, data_region, name, type enum(ferry_operator, vessel_owner, charterer, barge_operator), registration_number, address, region, modes text[] ('ferry','charter','barge'), verification_status enum(unverified, pending, verified), subscription_status, settings jsonb (alert_offsets, fee_bearer, permitted_hours, manager_can_override, require_passenger_names) |
| `memberships` *(global)* | id, user_id → profiles, org_id → orgs, role enum(owner, manager, captain, crew, charterer), status enum(active, suspended), invited_by; unique(user_id, org_id) |
| `platform_admins` *(global)* | user_id pk, created_at |
| `invitations` | org_id, phone_e164, role, token_hash, expires_at, accepted_at, invited_by |

### 5.2 Fleet, crew, documents
| Table | Fields |
|---|---|
| `vessels` | org_id, flag_country_code, operating_country_code, name, type enum(ferry, crew_boat, osv, tug, barge, speedboat, other), registration_no, imo, mmsi, flag, year_built, length_m numeric, passenger_capacity int, cargo_capacity_t numeric, engine, home_jetty_id, status enum(active, maintenance, idle, on_charter, laid_up), idle_since timestamptz, ferry_enabled bool, charter_enabled bool, photos text[] |
| `crew_members` | org_id, user_id (nullable), full_name, phone_e164, crew_role enum(captain, engineer, deckhand, ticket_agent, other), emergency_contact_name, emergency_contact_phone, status |
| `vessel_crew` | org_id, vessel_id, crew_member_id, from_date, to_date |
| `document_types` *(global)* | code pk, rule_set_id (null = global), name_key (i18n), applies_to enum(vessel, crew, org), issuer_name, default_validity_months int — see §16 for requirements |
| `documents` | org_id, subject_type enum(vessel, crew, org), subject_id uuid, document_type_code, number, issuer, issue_date date, expiry_date date, file_path, status enum(needs_review, valid, expiring, expired, rejected), extracted jsonb, extraction_confidence numeric, reviewed_by, reviewed_at, is_public bool, replaced_by uuid |
| `document_alerts` | org_id, document_id, offset_days int, channel enum(whatsapp, sms, email, in_app), sent_at, status; unique(document_id, offset_days, channel) |

### 5.3 Ferry
| Table | Fields |
|---|---|
| `jetties` *(global; admin-managed, orgs can propose)* | id, country_code, time_zone, name, aliases text[], admin_area, lat, lng, status enum(proposed, active) |
| `routes` | org_id, origin_jetty_id, destination_jetty_id, distance_km, duration_min, base_fare_minor, currency, active |
| `schedules` | org_id, route_id, vessel_id, days_of_week int[], departure_time time, active |
| `trips` | org_id, vessel_id, captain_crew_id, route_id (nullable), origin_text, destination_text, scheduled_departure, actual_departure, actual_arrival, status enum(scheduled, boarding, departed, arrived, cancelled), passenger_count int, lifejackets_confirmed bool, cargo_note, takings_cash_minor, takings_digital_minor, currency, source enum(app, whatsapp_voice, whatsapp_text, sms, admin), client_id text, notes; unique(org_id, client_id) |
| `manifest_entries` | org_id, trip_id, full_name, phone_e164, age_band, sex, next_of_kin_phone, seats int, ticket_id, boarded_at, is_amendment bool, client_id; unique(org_id, client_id) |
| `tickets` | org_id, trip_id, route_id, passenger_user_id (nullable), buyer_phone, qty, unit_price_minor, platform_fee_minor, currency, fee_bearer enum(passenger, operator), channel enum(online, agent_cash, agent_transfer), payment_id, code (short, unique), status enum(reserved, paid, used, refunded, cancelled) |
| `trip_positions` | org_id, trip_id, recorded_at, lat, lng, speed_kn, accuracy_m, client_id |
| `weather_cache` *(global)* | jetty_id or lat/lng key, fetched_at, valid_from, valid_to, data jsonb |
| `safety_checks` *(append-only)* | org_id, trip_id, checked_at, weather_snapshot jsonb, weather_fetched_at, sunrise, sunset, rules_applied jsonb, result enum(pass, warn, block), reasons text[], acknowledged_by, offline bool, client_id |
| `safety_overrides` *(append-only)* | org_id, trip_id, safety_check_id, requested_by, requested_at, decided_by, decision enum(approved, declined), reason, decided_at |
| `safety_thresholds` | org_id (null = default), country_code (default per country from §16), max_wind_kmh, max_gust_kmh, max_wave_m, max_precip_mm_h, night_block bool, permitted_start time, permitted_end time |

### 5.4 Charter
| Table | Fields |
|---|---|
| `charter_listings` | org_id, vessel_id, currency, day_rate_minor, min_rate_minor, min_days, operating_area, available_from, available_to, description, status enum(draft, live, paused), suggested_rate_minor, suggestion_inputs jsonb, public_document_ids uuid[] |
| `charter_requests` | charterer_org_id, owner_org_id (nullable for open requests), listing_id (nullable), vessel_type, start_date, end_date, location, country_code, purpose, crew_needs, budget_minor, currency, status enum(open, quoted, accepted, declined, expired) |
| `charter_quotes` | owner_org_id, request_id, vessel_id, currency, day_rate_minor, mobilisation_minor, terms jsonb, valid_until, status enum(sent, accepted, declined, expired) |
| `charters` | owner_org_id, charterer_org_id (nullable if off-platform), vessel_id, quote_id, start_date, end_date, on_hire_at, off_hire_at, currency, governing_country_code, day_rate_minor, total_value_minor, commission_bps int, booked_on_platform bool, status enum(pending_contract, pending_payment, active, completed, disputed, cancelled) |
| `contract_templates` *(global + org)* | org_id (nullable), country_code (nullable), locale, name, body_template, variables jsonb |
| `contracts` | owner_org_id, charter_id, template_id, body_html, pdf_path, owner_accepted_by, owner_accepted_at, charterer_accepted_by, charterer_accepted_at, acceptance_meta jsonb (ip, user agent) |
| `invoices` | org_id, charter_id (nullable), number, bill_to jsonb, line_items jsonb, currency, locale, subtotal_minor, tax_minor, tax_rule_code, total_minor, amount_paid_minor, due_date, status enum(draft, sent, part_paid, paid, overdue, void), pdf_path, payment_link; unique(org_id, number) |
| `tenders` | org_id, title, client_name, deadline, requirements_text, requirements_file_path, parsed jsonb, status enum(new, parsed, in_progress, exported) |
| `tender_packs` | org_id, tender_id, vessel_ids uuid[], items jsonb (requirement_id → document_id / section / missing, status), sections jsonb, status enum(draft, reviewed, exported), submit_anyway bool, export_path |
| `ratings` | rater_org_id, ratee_org_id, charter_id, score int (1–5), comment |

Charter tables use `owner_org_id` / `charterer_org_id` instead of a single `org_id`; RLS allows access to members of either side.

### 5.5 Payments and billing
| Table | Fields |
|---|---|
| `payments` | org_id (payee), payer_user_id, payer_org_id, purpose enum(ticket, subscription, invoice, charter_escrow, barge_escrow), reference_type, reference_id, provider enum(paystack, flutterwave, stripe, cash, transfer_manual), provider_ref unique, currency, amount_minor, provider_fee_minor, platform_fee_minor, status enum(initiated, success, failed, refunded), raw jsonb |
| `escrow_holds` | payee_org_id, payer_org_id, payment_id, charter_id (or load_id later), currency, amount_minor, released_minor, status enum(held, partially_released, released, refunded, disputed), release_rule jsonb, events jsonb[] |
| `payouts` | org_id, bank_account_id, escrow_hold_id (nullable), currency, amount_minor, commission_minor, provider_transfer_ref unique, status enum(pending, success, failed, reversed), initiated_by |
| `bank_accounts` | org_id, country_code, currency, provider, bank_code, account_number_last4, account_name, provider_recipient_code, verified bool |
| `plans` *(global)* | code pk (ferry_basic, ferry_fleet, charter_standard, charter_fleet), name_key, unit enum(per_org, per_vessel), limits jsonb (boats, ai_budget) |
| `plan_prices` *(global)* | plan_code, currency, price_minor, country_code (nullable = any), active_from; seed NGN (₦30,000 ferry basic per org; ₦150,000 charter per vessel) and suggested USD ($20; $100) — business assumptions, admin-editable |
| `subscriptions` | org_id, plan_code, currency, quantity int, amount_minor, period_start, period_end, status enum(trialing, active, past_due, read_only, cancelled), provider_subscription_ref |
| `fee_config` *(global)* | key (ticket_fee_bps, charter_commission_bps, charter_inapp_discount_bps), country_code (nullable = default), value int, effective_from |
| `webhook_events` *(global)* | provider, event_id, payload jsonb, received_at, processed_at; unique(provider, event_id) |
| `ledger_entries` *(append-only)* | org_id (nullable for platform), account enum(escrow, platform_revenue, payee_payable, provider_fees), payment_id, payout_id, currency, debit_minor, credit_minor, memo |

### 5.6 Messaging, AI, audit, privacy
| Table | Fields |
|---|---|
| `wa_messages` | org_id (nullable until matched), direction enum(in, out), phone_hash, wa_message_id unique, type, media_path, transcript, parsed jsonb, state enum(received, awaiting_confirm, confirmed, cancelled, failed), linked_entity_type, linked_entity_id |
| `ai_jobs` | org_id, kind enum(ocr_extract, voice_log, tender_parse, tender_draft, price_rationale, weather_explain, assistant), input_ref, prompt_version, model, output jsonb, tokens_in, tokens_out, cost_estimate_minor, latency_ms, status enum(queued, done, failed), error |
| `notifications` | org_id, user_id, channel, template, payload jsonb, sent_at, status |
| `incidents` | org_id, trip_id, vessel_id, reported_by, source, description, urgent bool, status, escalated_at |
| `audit_logs` *(append-only)* | org_id, actor_user_id, action, entity, entity_id, before jsonb, after jsonb, reason, ip, at |
| `consents` | user_id or phone_hash, purpose, version, granted_at, withdrawn_at |
| `data_requests` | user_id or phone_hash, kind enum(export, delete), status, due_at, completed_at |

Phase 3 tables (create in Phase 3): `cargo_loads`, `load_bids`, `load_matches`, `delivery_confirmations`, `rental_listings`, `rental_bookings`, `reviews` (barges use `vessels` with `type = barge`).

## 6. API endpoints

REST route handlers under `/api/v1`, JSON, Supabase JWT auth. Lists support `?cursor=&limit=`. Offline-capable POSTs accept `client_id` and are idempotent. Errors use `{error: {code, message, fields?}}`.

**Auth and org**
- `POST /auth/otp/send` · `POST /auth/otp/verify`
- `GET /me` · `PATCH /me`
- `POST /orgs` · `GET /orgs/:id` · `PATCH /orgs/:id`
- `GET /orgs/:id/members` · `POST /orgs/:id/invitations` · `POST /invitations/:token/accept` · `PATCH /memberships/:id` · `DELETE /memberships/:id`

**Vessels, crew, documents**
- `GET|POST /vessels` · `GET|PATCH|DELETE /vessels/:id`
- `GET|POST /crew` · `GET|PATCH|DELETE /crew/:id` · `POST /vessels/:id/crew`
- `POST /documents/upload-url` (signed storage URL) · `POST /documents` (create + queue OCR)
- `GET /documents?subject_type=&subject_id=&status=` · `GET|PATCH /documents/:id`
- `POST /documents/:id/confirm` (human review of extraction)
- `GET /compliance/summary` (score per vessel, expiring list)

**Ferry**
- `GET /jetties` · `POST /jetties` (propose) · `GET|POST /routes` · `PATCH /routes/:id`
- `GET|POST /schedules` · `PATCH /schedules/:id`
- `GET|POST /trips` · `GET|PATCH /trips/:id`
- `POST /trips/:id/safety-check` → `{result, reasons, weather, checked_at}`
- `POST /trips/:id/safety-check/:checkId/acknowledge`
- `POST /trips/:id/safety-override` (request) · `POST /safety-overrides/:id/decide`
- `POST /trips/:id/depart` (409 unless the latest check is pass, acknowledged warn, or block with approved override)
- `POST /trips/:id/arrive` · `POST /trips/:id/cancel`
- `GET|POST /trips/:id/manifest` · `PATCH|DELETE /manifest/:id`
- `POST /trips/:id/positions` (batch)
- `POST /tickets` (agent sale) · `POST /tickets/:code/board`
- `GET /public/routes/:id/trips` · `POST /public/tickets/checkout` · `GET /public/tickets/:code` · `GET /public/trips/:id/status`
- `GET /reports/daily?date=&vessel_id=` · `GET /reports/export.csv?from=&to=`
- `POST /sync` (batch of queued offline ops: trips, manifest entries, tickets, positions, safety checks)

**Charter**
- `GET|POST /charter-listings` · `PATCH /charter-listings/:id`
- `GET /public/board?type=&area=&from=&to=&min_capacity=` · `GET /public/board/:listingId`
- `POST /charter-requests` · `GET /charter-requests` · `POST /charter-requests/:id/quotes` · `POST /charter-quotes/:id/accept` · `POST /charter-quotes/:id/decline`
- `GET /charters` · `POST /charters` (record off-platform) · `GET|PATCH /charters/:id`
- `POST /charters/:id/on-hire` · `POST /charters/:id/off-hire` (each side confirms)
- `POST /charters/:id/contract` (generate) · `POST /contracts/:id/accept`
- `POST /charters/:id/escrow/checkout` · `POST /escrow/:id/release` · `POST /escrow/:id/dispute`
- `GET|POST /invoices` · `GET|PATCH /invoices/:id` · `POST /invoices/:id/send` · `POST /invoices/:id/pay-link`
- `GET|POST /tenders` · `POST /tenders/:id/parse` · `POST /tenders/:id/packs` · `PATCH /tender-packs/:id` · `POST /tender-packs/:id/draft-sections` · `POST /tender-packs/:id/export`
- `GET /vessels/:id/price-suggestion` · `GET /vessels/:id/buyer-suggestions`
- `POST /ratings`

**Payments and billing**
- `GET /plans` · `POST /subscriptions/checkout` · `GET /subscriptions/current` · `POST /subscriptions/cancel`
- `GET|POST /bank-accounts` (account name resolved via provider) · `POST /payouts`
- `POST /api/webhooks/paystack` · `POST /api/webhooks/flutterwave`

**WhatsApp, SMS and AI**
- `GET /api/webhooks/whatsapp` (verify token) · `POST /api/webhooks/whatsapp` (inbound messages, button replies, statuses)
- `POST /api/webhooks/termii` (delivery reports, inbound SMS)
- `POST /assistant/chat` (streamed, tool-calling)

**Countries, localisation and compliance**
- `GET /countries` (enabled only) · `GET /countries/:code/config` (currency, locale, time zone, rule set summary)
- `GET /compliance/requirements?vessel_id=` (required documents for this vessel's country, type and modes)
- `GET /plans?currency=` (prices from `plan_prices`)

**Privacy**
- `POST /privacy/requests` (export | delete) · `GET /privacy/requests/:id`

**Admin** (platform admins only, under `/api/v1/admin`)
- `GET /admin/orgs` · `POST /admin/orgs/:id/verify`
- `GET /admin/documents/review-queue`
- `GET /admin/disputes` · `POST /admin/escrow/:id/resolve` (release | refund | split)
- `GET|PUT /admin/fee-config` · `GET|PUT /admin/safety-thresholds` · `GET|PATCH /admin/jetties`
- `GET /admin/audit-logs` · `POST /admin/passenger-data-access` (reason required)
- `GET|PUT /admin/countries` · `GET|PUT /admin/plan-prices` · `GET|PUT /admin/payment-routes`
- `GET|POST /admin/rule-sets` · `POST /admin/rule-sets/:id/versions` · `POST /admin/rule-sets/:id/publish`

**Scheduled jobs (Supabase Edge Functions + pg_cron).** Jobs run hourly in UTC and act on the orgs whose local time matches the target (e.g. alerts at 07:00 in each org's time zone). Times below are local to each org.
- `alerts-expiry` daily 07:00: find documents at each offset; send alerts not yet sent.
- `weather-poll` every 30 min from 05:00 to 20:00: refresh `weather_cache` for active jetties and route midpoints.
- `idle-vessels` daily 08:00: set `idle_since`, create price and buyer suggestions.
- `invoices-overdue` daily 09:00: mark overdue, send reminders.
- `subscriptions-renew` daily: renewals, grace period, read-only switch.
- `reconcile-payments` daily 02:00: compare provider settlements with `payments`.
- `retention` weekly: anonymise data past retention.

## 7. Recommended stack

| Need | Choice | Notes |
|---|---|---|
| Web app | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | One codebase for owner dashboard, captain PWA, public pages. |
| Database, auth, storage | Supabase (Postgres, Auth, Storage, RLS, Edge Functions, pg_cron) | Managed Postgres with row-level security for multi-tenant data; phone OTP. |
| ORM / migrations | Drizzle ORM + SQL migrations | Type-safe queries; RLS written in SQL. |
| Validation | Zod | Shared client/server schemas; AI output validation. |
| Payments | `PaymentProvider` abstraction with per-country/currency routing. Paystack (primary) and Flutterwave (secondary) first for NGN and West Africa; Stripe later for USD and other markets | Cards, bank transfer, USSD, subaccounts/splits, transfers for payouts, recurring billing. Escrow is platform-controlled funds with release by transfer; confirm the legal structure in each country first (Appendix). |
| i18n | next-intl (ICU message format), `Intl` for numbers/money/dates, libphonenumber-js | English first; French (Côte d'Ivoire, Cameroon) and Portuguese (Brazil) planned. |
| Time zones | Store UTC; IANA zones on org/jetty; `date-fns-tz` or Temporal polyfill | Sunrise/sunset per jetty location. |
| SMS / OTP | Termii (Nigeria first) behind `MessagingClient`, provider chosen per country | Register a sender ID early; add other SMS providers per market. |
| WhatsApp | WhatsApp Cloud API (Meta) | Voice notes, document photos, alert templates, interactive buttons. Needs Meta business verification and approved templates. |
| Maps | Mapbox GL JS | Live map, routes, jetties. |
| LLM | An LLM API with tool calling, structured JSON output and vision, behind `LlmClient` | Choose vendor at build time; keep it swappable. |
| Speech-to-text | A Whisper-class STT API behind `SttClient` | Test on Nigerian English and Pidgin voice notes early. |
| OCR | Vision-LLM extraction; fallback to a document-OCR service (e.g. Google Document AI or AWS Textract) behind `OcrClient` | Certificates are often phone photos of paper. |
| Weather | Open-Meteo Forecast + Marine APIs behind `WeatherClient` | Wind, gusts, waves, precipitation; add a second provider later for redundancy. |
| PDF | `@react-pdf/renderer` (or headless Chromium in a serverless function) | Invoices, contracts, tender packs. |
| Offline | Workbox service worker + Dexie (IndexedDB) | Cache + outbox + sync. |
| Hosting | Vercel + Supabase (pick the region with the best latency to Lagos for launch; see §12 data residency for later regions) | Preview deploys per PR. |
| Monitoring | Sentry, Supabase logs, uptime check | |
| Product analytics | PostHog, with no personal data in events | KPIs. |

## 8. Mobile, PWA and offline approach

**Why PWA first:** no app-store delay, runs on low-cost Android phones, one codebase. A Capacitor wrapper can come later if background GPS needs it.

**Principles**
- Captain/crew screens (`/captain/*`) are a separate lightweight route group: minimal JS, no heavy charts, large tap targets, one-handed use, high-contrast for sunlight.
- The service worker precaches the app shell and captain routes. At login and whenever online, the app caches in IndexedDB: today's trips, assigned vessels, routes, jetties, safety thresholds, latest weather for the captain's jetties, vessel/crew document expiry dates.
- **Write path:** each create/update on captain screens writes to the IndexedDB `outbox` with `client_id` (UUID v7), `op`, `payload`, `created_at`. A sync worker posts batches to `POST /api/v1/sync` when online (Background Sync where supported; otherwise on app focus and every 30 s).
- **Server:** `/sync` processes ops in order, upserts by `(org_id, client_id)`, returns per-op status and server ids. Conflict rules: after departure the server's trip status wins; manifest entries are additive; edits after lock become amendments; positions are append-only.
- **UI states:** each record shows "Saved on phone" or "Synced". An offline banner shows the number of pending items. A Pending sync screen lists them.
- **Safety lock offline:** night, capacity and document checks run on the device; weather uses the cached forecast if under 3 hours old, else `warn: weather unknown`. The check is stored locally and synced with `offline = true`. An override needs the owner's decision, which needs a connection (WhatsApp or app); if neither is available a blocked trip stays blocked.
- **GPS:** sample every 30 s while departed and the screen is on; store in outbox; batch uploads. Show "Tracking paused" if the browser stops updates.
- **SMS fallback:** a captain with no data can send a formatted SMS (e.g. `TRIP 4 CMS IKD 18 27000`) to the Termii number; parsed like a WhatsApp text and confirmed by SMS reply.
- **Data cost:** compress images on device (max 1600 px, ~70% JPEG); lazy-load maps; no autoplay media; cache static assets for a long time.
- **Performance budget:** captain routes < 200 KB JS gzipped; first load under 5 s on a Slow 3G profile; repeat load under 1 s from cache.

## 9. Screens and user flows

### 9.1 Screens
**Public:** landing; pricing; passenger ticket purchase (route → trip → seats → pay → QR ticket); ticket view; trip status; charter board list; listing detail; sign up / log in (OTP); privacy notice.

**Owner / manager app:** onboarding wizard (org → modes → first vessel → upload documents → invite captain → plan); dashboard (today's trips, takings, alerts, compliance score, idle vessels, pending overrides); vessels list + detail (overview, documents, crew, trips, charters, earnings); documents (all, expiring, needs review) + review screen (image beside extracted fields); crew list + detail; routes and schedules; trips list + detail (manifest, safety checks, track); live map; daily report; overrides inbox; charter listings; requests and quotes; charters + detail; contract view/accept; invoices + editor; tenders + tender-pack builder (checklist with status per item, section editor, export); assistant; payments and payouts; subscription and billing; members; settings (alerts, safety thresholds stricter-only, fee bearer, manager override permission).

**Captain PWA:** Today (assigned trips, start ad-hoc trip); Trip (safety result, manifest add/scan, sell ticket, depart/arrive); manifest quick-add; scan ticket; my documents; pending sync.

**Charterer:** board; request form; my requests and quotes; contract accept; pay into escrow; on-hire/off-hire confirm; invoices; rate owner.

**Admin:** orgs and verification; document review queue; disputes and escrow; fee config; safety thresholds; jetties; audit logs.

### 9.2 Key flows

**F1 — Owner onboarding (target under 10 minutes)**
1. Enter phone → OTP → name.
2. Create org; choose Ferry, Charter or both.
3. Add first vessel (name, type, capacity).
4. Photograph or upload documents → OCR runs → review extracted dates → confirm.
5. Invite captain by phone (WhatsApp message with link).
6. Choose plan (pilot/trial if enabled) → dashboard.

**F2 — Ferry trip with safety lock**
1. Captain opens Today → picks a scheduled trip or starts an ad-hoc one.
2. App runs the safety check → shows Pass / Warn / Block with plain reasons ("Wind gusts 45 km/h, above your limit of 35 km/h"; "Arrival after sunset at 18:52").
3. Warn → captain acknowledges. Block → captain taps Request override → owner gets a WhatsApp message with the reasons and Approve/Decline buttons → decision logged.
4. Manifest: add passengers or scan online tickets; capacity counter; life-jacket checkbox.
5. Depart → tracking starts → Arrive → enter cash takings → trip closes.
6. Owner sees the trip in the daily report.

**F3 — Voice-note trip log**
1. Captain sends a voice note to the bot number.
2. Bot matches the phone to a crew member and org; transcribes; extracts fields.
3. Bot replies: "Trip: CMS → Ikorodu, 18 passengers, ₦27,000 cash, vessel Blessing 2. Confirm?" [Confirm] [Edit] [Cancel].
4. Confirm → trip saved (`source = whatsapp_voice`). Edit → bot asks which field to change.

**F4 — Certificate upload and alert**
1. Owner sends a photo to the bot or uploads in the app.
2. OCR + extraction → document saved `needs_review` → owner reviews and confirms.
3. Cron sends alerts at the configured offsets; the alert has a "Renewed — upload new" link that replaces the old document.

**F5 — Tender pack**
1. Owner creates a tender and uploads the tender PDF.
2. AI parses a requirement checklist → owner edits it.
3. System maps documents: green (valid), amber (expires before the tender deadline or the contract period), red (missing/expired).
4. AI drafts cover letter, company profile, vessel spec sheet, HSE statement → owner edits.
5. Owner marks Reviewed → export merged PDF + ZIP.

**F6 — Spot charter with escrow**
1. Owner lists an idle vessel (accepts or edits the suggested rate).
2. Charterer finds the listing → sends a request → owner quotes → charterer accepts.
3. Contract generated → both accept.
4. Charterer pays mobilisation + first hire period into escrow.
5. Both confirm on-hire → funds release by rule (e.g. mobilisation on on-hire, hire per period or at off-hire) → payout to owner minus commission.
6. Off-hire → final invoice → settlement → ratings.
7. Dispute → funds frozen → admin resolves.

## 10. AI features: prompts and logic

Rules for every AI feature:
- Call through `LlmClient` with structured (JSON-schema) output; validate with Zod. On validation failure, retry once with the error message; then mark the job `failed` and fall back to manual entry.
- Log every call in `ai_jobs` (prompt version, model, tokens, estimated cost, latency). Enforce a per-org monthly AI budget from plan limits.
- Send the minimum personal data. Strip passenger names and phone numbers from prompts unless the task needs them.
- Output that changes data is saved as a draft for a human to confirm.
- Prompts live in `/src/server/ai/prompts/*.ts`, versioned (`prompt_version`), with tests against recorded fixtures.

### 10.1 Certificate OCR and extraction
Input: image/PDF pages as images, the org's country, and the document types from that country's rule set (§16).

System prompt:
```
You extract data from maritime and crew documents issued in {country_name}.
Known document types for this country: {document_types_for_country}
(for Nigeria: vessel registration, LASWA licence, NIMASA certificates, Cabotage registration,
class certificates, insurance, safety equipment, crew competency and STCW certificates, medicals, IDs).
Return JSON only, matching the schema. Use null for anything you cannot read clearly.
Never guess a date. Write dates as YYYY-MM-DD. If a date is written with numbers only
(e.g. 05/06/2026), read it in the country's usual order ({date_order}; DMY for Nigeria) and set
date_format_assumed accordingly.
Give a confidence from 0 to 1 for each field.
```
Schema: `{document_type_code, number, issuer, holder_name, vessel_name, issue_date, expiry_date, field_confidence: {<field>: number}, date_format_assumed, notes}`

Logic:
- `expiry_date` null or confidence < 0.8 → stays `needs_review` with the field highlighted.
- Holder or vessel name does not match the subject → flag "name mismatch".
- Expiry in the past → `expired` after confirmation.
- No expiry but the type has `default_validity_months` → suggest an expiry from the issue date; still requires confirmation.
- Same type and subject already on file → offer to mark the old one `replaced_by`.

### 10.2 WhatsApp voice/text trip and sales logging
Pipeline: media download → STT (language hint from the user's locale; for Nigeria: English, allow Nigerian Pidgin) → extraction with context (org's vessels, routes, jetty aliases, the captain's open trips today).

System prompt:
```
You turn a boat captain's message into a structured log. The captain works for a ferry or vessel
company in {country_name}. Messages may be in {languages} and may use local jetty names and
number words (for Nigeria: English or Pidgin; "twenty-seven k" = 27000 naira).
Context: vessels {vessels}, routes with aliases {routes}, open trips {open_trips}.
Return JSON only. kind is one of "trip_log", "expense", "fuel", "incident", "other".
Amounts are integer major units of {currency}. If a field is not in the message, return null. Do not invent values.
If the message reports danger, injury, capsizing, fire or a missing person, set kind = "incident"
and urgent = true.
```
Schema: `{kind, vessel_id, route_id, origin, destination, passenger_count, amount, currency, payment_method, expense_category, urgent, summary_for_confirmation}`

Logic:
- The bot always replies with `summary_for_confirmation` and buttons; nothing is final without Confirm.
- Missing required field → the bot asks one question at a time.
- `urgent = true` → immediately alert the owner and managers by WhatsApp + SMS, create an `incidents` row, and reply telling the sender to contact emergency services; the bot does not replace them.
- Unknown phone number → reply with a sign-up link; keep only the message id.

### 10.3 Weather-risk flag
Rules decide; AI only explains.
- Thresholds: default per country from the rule set (§16), stricter per org.
- Inputs: forecast at origin and route midpoint for the departure→arrival window (wind, gusts, wave height, precipitation, weather code/visibility), sunrise/sunset, thresholds (`safety_thresholds`: org values, never looser than platform defaults).
- A deterministic engine returns `result` and `reasons[]` (each reason has a code, the measured value and the limit).
- Optional LLM call turns `reasons` into one or two short sentences for the captain (template fallback). It cannot change the result.
- Default thresholds are an open decision (Appendix). Ship conservative placeholder values behind admin config and do not present them as official limits.

### 10.4 Idle-vessel pricing and buyer suggestions
- **Price (rules first):** baseline = median day rate of this vessel's last N charters (or the org's same-type vessels); adjust toward the median of live board listings of the same type and size band in the same area over the last 90 days; reduce by a configurable step per week idle; never below the owner's `min_rate_minor`. Save the inputs in `suggestion_inputs` and show them.
- The LLM writes a short rationale and a listing description from the vessel profile and the computed numbers only.
- **Buyers (no LLM in ranking):** score charterer orgs by past charters with this owner, requests or searches for a similar vessel type in the last 90 days, and area match. The LLM can draft an outreach message for the owner to send.

### 10.5 Tender parsing and drafting
Step 1, parse prompt:
```
You read an oil and gas vessel-hire tender or invitation to bid. List every document or
information requirement the bidder must submit, and the key commercial facts.
Return JSON only. For each requirement, quote the tender's own wording in source_text.
Do not add requirements that are not in the text.
```
Schema: `{title, client, deadline, contract_period, vessel_requirements: {type, min_length_m, capacity, dp_class, max_age_years, other}, requirements: [{id, category: company|vessel|crew|hse|commercial|other, description, source_text, mandatory}]}`

Step 2, mapping (code): match each requirement to `document_types` and stored `documents` by type and subject; status `valid`, `expires_before_deadline`, `missing`. Unmatched items are shown for manual mapping.

Step 3, drafting prompt (one call per section: cover letter, company profile, vessel specification, HSE statement):
```
Draft the {section} for a tender response using ONLY the facts below about the company and
vessels. Do not invent certificates, numbers, clients, dates or experience. Where the tender
needs a fact that is not provided, write [MISSING: what is needed] so the owner can fill it in.
Write plain, formal business English.
Facts: {facts_json}
Tender requirements: {requirements_json}
```
Logic: export is blocked while any `[MISSING:` marker remains or any mandatory item is red, unless the owner ticks "Submit anyway" (logged). A fixture test checks that drafts contain no facts absent from `facts_json`.

### 10.6 Assistant (in-app and WhatsApp)
Tool-calling agent. Read tools: `get_vessel_status`, `list_expiring_documents`, `get_daily_report`, `get_trip`, `list_idle_vessels`, `list_open_invoices`. Draft tools: `draft_trip_log`, `draft_invoice`, `draft_tender_pack`, `suggest_price`. No tool can move money, delete data, change roles or override safety.

System prompt:
```
You are the [Company Name] assistant for a vessel operator in {country_name}. Answer only from tool
results. If the data is missing, say so and suggest how to add it. Keep replies short; on
WhatsApp use at most 5 lines. Reply in {locale}. Show money in {currency} and dates in the user's local format.
You can prepare drafts but never send money, delete records or approve safety overrides.
```

## 11. Payments, escrow and fees

- **Abstraction:** `PaymentProvider` interface: `supports(country, currency, purpose)`, `initCheckout`, `verify`, `createSubaccount`, `createTransferRecipient`, `transfer`, `refund`, `createSubscription`, `parseWebhook`. Implementations: Paystack (first), Flutterwave (second), Stripe (later, Phase 4), `FakeProvider` for tests. Each provider normalises its webhooks into one internal `PaymentEvent` type.
- **Routing:** `PaymentRouter.pick(country, currency, purpose)` reads `payment_provider_routes` and falls back by priority. Nigeria NGN → Paystack, then Flutterwave. USD and later markets → Stripe or a local provider once configured. Business code never names a provider.
- **Currency rules:** an amount is always paired with its currency; the minor-unit digits come from `currencies`; payments, holds, payouts and ledger entries in one flow share one currency. `exchange_rates` are for reporting only.
- **Tickets:** checkout → provider webhook (e.g. Paystack `charge.success`) → payment `success` → ticket `paid`. Fee: `platform_fee = round(price × ticket_fee_bps / 10000)`. Bearer `passenger`: added to the price. Bearer `operator`: deducted at settlement. Use provider subaccounts/splits so the operator's share settles directly where possible.
- **Subscriptions:** price from `plan_prices` in the org's billing currency (NGN in Nigeria; USD suggested elsewhere); per-vessel plans bill `price × charter-enabled vessels`. Provider recurring billing. 7-day grace period, then `read_only`: billing-gated screens become read-only, but trips, manifests, safety checks and alerts keep working.
- **Escrow (charters; barge loads later):** charterer pays → `escrow_holds.held` + ledger entries → release by rule (mobilisation when both confirm on-hire; hire per period or at off-hire) → transfer to the owner minus `commission_bps` (minus `charter_inapp_discount_bps` where it applies) → `payouts`. A dispute freezes the hold; only an admin resolves (release, refund or split). Every step is written to `audit_logs` and `ledger_entries`.
- **Do not go live with escrow until the legal structure is confirmed** (Appendix).
- **Reconciliation:** a daily job compares provider settlements and transfers with `payments` and `payouts`; mismatches go to the admin queue.
- Amounts are integer minor units end to end; display with `Intl.NumberFormat(locale, {style: 'currency', currency})`.

## 12. Security, data protection and data residency (NDPR/NDPA, GDPR)

At launch, Nigeria's data protection framework (the NDPR and the Nigeria Data Protection Act 2023 (NDPA), overseen by the Nigeria Data Protection Commission) applies. As the platform expands, other laws will apply, such as the EU GDPR wherever we process data of people in the EU or use EU-based processors, and each new country's own data-protection law. Confirm the obligations for each country with a lawyer before launch there. Build to these defaults, which aim to satisfy the strictest of these:

- **Notice and consent:** passengers and crew see a short privacy notice where data is collected. Record consent in `consents` for marketing and optional fields. State that manifest data is collected for passenger safety.
- **Minimisation:** manifests need only name and seats unless the operator or regulator requires more; next-of-kin is optional.
- **Retention:** manifests and GPS positions kept for a configurable period (placeholder: 24 months, to confirm against LASWA requirements), then anonymised by the `retention` job. Documents kept while the account is active plus a set period.
- **Rights:** export and deletion requests (`data_requests`) from settings and the public privacy page; admin workflow with a due date.
- **Access control:** RLS on every table; role checks in services; admin reads of passenger data require a reason and are logged.
- **Encryption:** TLS everywhere; encryption at rest (Supabase); private storage buckets with short-lived signed URLs; bank accounts stored only as last 4 digits + provider recipient code.
- **Secrets:** environment variables only; never in the repo; separate keys per environment; rotate on staff change.
- **Auth:** OTP rate limits and lockout; session expiry; optional 2FA for owners; device list and "sign out everywhere".
- **Webhooks:** verify signatures (Paystack `x-paystack-signature` HMAC-SHA512; Flutterwave `verif-hash`; Meta `X-Hub-Signature-256`); store event ids for idempotency.
- **Audit:** `audit_logs` for every write to money, documents, safety and memberships.
- **Abuse:** rate limits per IP and user on OTP, public checkout and board requests; captcha on public forms if abused.
- **Logging:** no personal data in logs or analytics; hash phone numbers.
- **Processors:** list every processor (Supabase, Vercel, Paystack, Flutterwave, Meta, Termii, Mapbox, LLM/OCR/STT vendors, Sentry, PostHog) on a public page; sign data-processing agreements; disclose cross-border transfers in the privacy notice.
- **Data residency:**
  - Every org has a `data_region` (default from its country). At launch all data sits in one Supabase region chosen for Lagos latency; record which region that is, and disclose it in the privacy notice.
  - The NDPA restricts transfers of personal data outside Nigeria unless conditions are met (e.g. adequate protection or another lawful basis). The GDPR has similar transfer rules for EU personal data (adequacy decisions, standard contractual clauses). Keep a transfer register: which processor, which country, which legal basis.
  - Design for more than one region: keep storage paths, database connection and backups selectable per `data_region`, so a market that requires local or regional storage can get its own Supabase project later without code changes.
  - Send AI vendors only the minimum data, and prefer vendors that offer no-training, zero-retention or regional processing terms.
  - GDPR-ready defaults: lawful basis recorded per purpose, records of processing, data-processing agreements, data-subject requests within one month, privacy by default.
- **Breach response:** written plan in `/docs/RUNBOOK.md`, including regulator notification within each applicable legal deadline (for example, the GDPR sets 72 hours; confirm the NDPA and other countries' current requirements).
- **Safety liability:** terms state the safety lock supports, and does not replace, the captain's and owner's responsibility; overrides record who approved them.

## 13. Testing

- **Unit (Vitest):** money and fee maths; safety rules engine (table-driven: wind, gust, wave, night, capacity, documents, stale weather); expiry offsets; sync conflict rules; invoice totals and VAT; price suggestion; Zod schemas; AI output parsers with recorded fixtures.
- **Database:** RLS tests for every table (org A cannot read or write org B; captain cannot read finances; passenger sees only own tickets; append-only tables reject UPDATE/DELETE). Migrations run clean from zero.
- **Integration:** route handlers against local Supabase with fake integrations; webhook signature checks; idempotency (the same event twice has one effect).
- **E2E (Playwright):** F1 onboarding, F2 trip with block + override, F3 voice log (fake STT/LLM), F4 certificate review, F5 tender export, F6 charter escrow happy path and dispute. Include a throttled-network run and an offline test (go offline, create trip + manifest, go online, verify sync).
- **AI evaluation:** a small labelled set (real certificate photos used with permission, voice notes in English and Pidgin, two sample tenders). Measure field accuracy; set targets after the first measurement; re-run on every prompt or model change.
- **Internationalisation:** tests run with at least two seeded countries (NG and a test country `ZZ` with USD, `fr` locale and a different time zone) to catch hard-coded Nigerian values; money formatting for NGN and USD; alert scheduling across time zones; a CI check that fails on untranslated keys in enabled locales.
- **Field test:** before each pilot release, test on a low-cost Android phone at a Lagos jetty.
- **CI:** GitHub Actions runs lint, typecheck, unit, RLS and e2e on every PR; merges blocked on failure.

## 14. Deployment and environments

- **Environments:** `local` (Supabase CLI + fake integrations), `staging` (provider test keys, WhatsApp test number), `production`.
- **Deploys:** Vercel for Next.js with a preview per PR; one Supabase project per environment; migrations applied by CI on merge to `main` (staging) and on a release tag (production). Edge Functions and pg_cron jobs deployed with the Supabase CLI.
- **Start early (long lead times):** Meta business verification and WhatsApp template approval; Termii sender ID registration; Paystack/Flutterwave business verification and subaccount/transfer approval.
- **Backups:** daily backups and point-in-time recovery on production; test a restore once a month.
- **Monitoring:** Sentry (web + Edge Functions); uptime check on `/api/health`; alerts on webhook failures, cron failures and sync error spikes.
- **Feature flags:** charter mode, escrow, Phase 3 features.
- **Release checklist:** migrations reviewed; RLS tests pass; webhook secrets set; templates approved; rollback plan written.

## 15. Multi-country, multi-currency, languages and time zones

**Countries**
- Every org has a `country_code`; vessels have flag and operating countries; jetties have a country and time zone.
- A country is switched on by admin (`countries.enabled`) only when its rule set, currency, locale, payment route and messaging provider are configured. At launch only `NG` is enabled.
- `launch_status` tracks planned → validating → pilot → live. Planned markets in roadmap order: NG; then GH, CI, CM; then KE, TZ (and Lake Victoria routes, which may span KE/TZ/UG); PH, ID; Gulf of Mexico hubs (US, MX); BR. Market details beyond Nigeria still need validation; do not seed real rules or statistics for them.

**Currencies**
- Supported at launch: NGN and USD (USD price book exists for non-Nigerian or USD-billed customers; suggested prices, to validate).
- Each org has a billing currency. Listings, quotes, charters and invoices carry their own currency, so a Nigerian owner can quote a charter in USD where the law and parties allow.
- No automatic conversion when billing. Dashboards that sum across currencies show one total per currency; an optional "approximate total" uses `exchange_rates` and is labelled approximate.
- Helpers in `/src/lib/money.ts`: `Money {amountMinor: bigint, currency}`; add/subtract only for the same currency; percent fees with banker's rounding at the minor unit; formatting by locale.

**Languages (i18n)**
- next-intl with ICU messages in `/messages/{locale}.json`. Locales at launch: `en` (default), `en-NG` (local wording such as "jetty", naira). Planned: `fr`, `pt-BR`; later local languages where markets need them (for Nigeria: Pidgin, Yoruba, Igbo, Hausa are candidates).
- Locale resolution: user setting → org default → browser → `en`.
- WhatsApp templates, SMS texts, PDFs (invoices, contracts, tender packs) and AI prompts take a locale parameter.
- Right-to-left is not required for the planned markets; do not block it (use logical CSS properties).

**Time zones**
- Store UTC. Display in user → org → jetty time zone.
- Safety lock night rules use sunrise/sunset at the jetty's coordinates and the jetty's time zone.
- Expiry dates are calendar dates (no time); "expires today" is computed in the org's time zone.
- Cron jobs run hourly in UTC and select orgs by local time (see §6).

## 16. Country compliance module

**Purpose:** keep every country's regulation as data, so a new market is a new rule set, not new code. Nigeria is the first rule set.

**Tables**
| Table | Fields |
|---|---|
| `compliance_rule_sets` *(global)* | id, country_code, name, version, status enum(draft, published, retired), published_at, reviewed_by, legal_review_note |
| `regulators` *(global)* | id, rule_set_id, name, short_name, scope enum(national, state, port), website |
| `document_requirements` *(global)* | rule_set_id, document_type_code, applies_to enum(vessel, crew, org), vessel_types text[], modes text[], mandatory bool, regulator_id, alert_offsets int[] (override) |
| `charter_eligibility_rules` *(global)* | rule_set_id, code (e.g. local_ownership_required), description_key, check jsonb (fields to test), severity enum(block, warn) |
| `safety_rule_defaults` *(global)* | rule_set_id, max_wind_kmh, max_gust_kmh, max_wave_m, night_block, permitted_start, permitted_end |
| `tax_rules` *(global)* | rule_set_id, code, rate_bps, applies_to, label_key |

**Engine (`/src/server/compliance`)**
- `requirementsFor(vessel)` → the mandatory documents for the vessel's operating country, type and modes, from the published rule set.
- `complianceScore(vessel)` → valid mandatory documents ÷ mandatory documents.
- `charterEligibility(vessel, charter)` → results of `charter_eligibility_rules` for the charter's governing country (e.g. a cabotage/local-ownership check), each `pass`, `warn` or `block` with reasons.
- `safetyDefaults(country)` → default thresholds that org settings may only tighten.
- Rule sets are versioned. Documents and checks record the rule-set version they were evaluated against.

**First rule set: Nigeria (NG)**
- Regulators: NIMASA (national), LASWA (Lagos State waterways).
- Document requirements: Cabotage registration and NIMASA certificates for charter-enabled vessels; LASWA licence for Lagos ferry operations; vessel registration, insurance, safety equipment, crew competency and STCW, plus the global types.
- Charter eligibility: a Cabotage check that warns when vessel or owner data needed for Cabotage compliance is missing or expired (exact rule wording to confirm with a Nigerian maritime lawyer).
- Safety defaults: conservative placeholders until agreed with LASWA guidance (Appendix).
- Seed this rule set as `draft`; an admin publishes it after review.

**Adding a country (Phase 4 checklist)**
1. Validate the market (vessels, regulators, documents, competitors, payments, language, willingness to pay).
2. Create the rule set as `draft` with regulators, document types and requirements, eligibility and safety defaults, tax rules.
3. Legal review; publish.
4. Add currency price book, payment route, messaging provider, locale strings.
5. Set `countries.enabled = true` and `launch_status = pilot`.

---

# Part C — Milestone plan (Claude Code prompts)

Paste each prompt into Claude Code in order. Do not start the next milestone until every acceptance criterion passes. Each prompt assumes `CLAUDE.md` and `BUILD_SPEC.md` are in the repo root. After each milestone, ask Claude Code: "List every acceptance criterion for this milestone and show the evidence that each one passes."

### M0 — Repository and foundations
**Prompt:**
> Read CLAUDE.md and BUILD_SPEC.md §7 and §14. Scaffold a Next.js App Router project with strict TypeScript, Tailwind, shadcn/ui, ESLint, Prettier, Vitest and Playwright, using pnpm. Add Supabase CLI config for local development, Drizzle ORM, and the folder structure in CLAUDE.md. Create `/src/server/integrations` with interfaces and fake implementations for PaymentProvider, MessagingClient (WhatsApp + SMS), LlmClient, SttClient, OcrClient and WeatherClient. Add `/api/health`. Add GitHub Actions CI for lint, typecheck and unit tests. Add `.env.example` listing every variable the spec needs. Add `/src/lib/money.ts` (Money type with currency, minor-unit helpers, locale formatting for NGN and USD) and `/src/lib/dates.ts` (UTC storage, display in a given IANA time zone) with tests. Set up next-intl with `en` and `en-NG` message files.

**Acceptance criteria:**
- `pnpm dev` serves a page; `/api/health` returns 200.
- `pnpm lint && pnpm typecheck && pnpm test` pass locally and in CI.
- Local Supabase starts and Drizzle connects.
- Every integration has an interface and a fake; no vendor SDK is imported outside `/src/server/integrations`.

### M1 — Auth, organisations, roles and RLS
**Prompt:**
> Implement the §5.1 tables and the §3 roles. Phone OTP login via Supabase Auth with Termii behind MessagingClient (the fake prints the code in dev). Build org creation, memberships, invitations by phone (token link) and platform_admins. Write the `has_role(org_id, roles[])` and `is_platform_admin()` SQL functions and RLS policies for every table created. Screens: login, onboarding step 1 (org + modes), members page with invite and role change. Write audit_logs rows for membership changes. Write RLS tests for cross-org isolation and role limits.

**Acceptance criteria:**
- A new user signs up by OTP, creates an org and invites a captain by phone; the captain accepts and logs in.
- RLS tests: a user in org A cannot select, insert or update org B rows; a captain cannot change roles.
- Audit rows exist for invite, accept and role change.

### M1b — Countries, currencies, locales, time zones and the compliance module
**Prompt:**
> Read BUILD_SPEC.md §15 and §16. Implement the §5.0 tables (countries, currencies, exchange_rates, locales, payment_provider_routes) and the §16 compliance tables and engine. Add country_code, currency, time_zone, default_locale and data_region to orgs, and locale/time_zone to profiles. Seed NG (enabled, NGN, Africa/Lagos, en-NG) with the Nigeria rule set as draft, NGN and USD currencies, and a test-only country ZZ (USD, fr, a non-Lagos time zone) used only in tests. Org creation picks a country and fills defaults. Add admin screens to edit countries and publish rule sets. Add a lint rule or test that fails on hard-coded 'NG', 'NGN' or 'Africa/Lagos' outside seed and config files.

**Acceptance criteria:**
- Creating an org in NG gives NGN, Africa/Lagos and en-NG by default; the ZZ test org gives USD and its own zone.
- `requirementsFor(vessel)` returns the NG requirements for an NG vessel and only global types for a ZZ vessel.
- Rule sets are versioned; only a published version is used by the engine.
- The hard-coded-value check passes.

### M2 — Vessels, crew and documents (without AI)
**Prompt:**
> Implement the §5.2 tables, the §6 "Vessels, crew, documents" endpoints and screens: vessels list/detail, crew list/detail, documents (all / expiring / needs review), camera upload with on-device compression, private storage with signed URLs. Load document types and requirements from the compliance module (§16) for the vessel's country. Compute document status from expiry_date and a per-vessel compliance score. Add onboarding steps 3–5 (first vessel, documents, invite captain).

**Acceptance criteria:**
- Owner adds a vessel and crew, uploads a certificate photo, enters dates manually and sees valid / expiring / expired status.
- Compliance score shows on the vessel page and the dashboard.
- Stored files are not publicly readable; signed URLs expire.
- Images wider than 1600 px are resized before upload.

### M3 — OCR extraction and expiry alerts
**Prompt:**
> Implement §10.1 using OcrClient/LlmClient with Zod-validated structured output, saving to `documents.extracted`, `ai_jobs`, and status `needs_review`. Build the review screen (image beside fields, low-confidence fields highlighted, confirm/edit). Implement the `alerts-expiry` job (Edge Function + pg_cron, hourly, selecting orgs whose local time is 07:00) using rule-set and org alert offsets, sending through MessagingClient (WhatsApp template, SMS fallback) plus in-app notifications, recorded in `document_alerts` so no alert is sent twice. Add fixtures and tests for the parser and the offset logic.

**Acceptance criteria:**
- Uploading a certificate creates an ai_job and a draft with extracted fields; nothing becomes valid until confirmed.
- Fields with confidence below 0.8 are highlighted; null dates are never filled automatically.
- Running the alert job twice sends each due alert once.
- An org in a different time zone gets its alert at its own 07:00.
- Tests cover day-first dates and invalid AI output falling back to manual entry.

### M4 — Ferry routes, trips and manifests
**Prompt:**
> Implement the §5.3 tables jetties, routes, schedules, trips and manifest_entries, and the ferry endpoints except tickets, safety and positions. Owner screens: routes and schedules, trips list/detail, daily report. Captain PWA route group `/captain`: Today, Trip screen, manifest quick-add with capacity counter and hard capacity block, life-jacket checkbox, depart/arrive (no safety check yet), close trip with cash takings. Seed a few Lagos jetties as sample data marked "proposed" so an admin must verify names and coordinates.

**Acceptance criteria:**
- A captain runs a scheduled or ad-hoc trip end to end, and the owner sees it in the daily report.
- The manifest cannot exceed vessel capacity.
- The manifest locks at departure; later edits are logged amendments.
- RLS test: a captain cannot view org finances beyond own trips.

### M5 — Offline mode and sync
**Prompt:**
> Implement §8. Add a Workbox service worker that precaches the app shell and `/captain` routes; Dexie stores for cached reference data and an outbox; the sync worker; and `POST /api/v1/sync`, processing ops in order and idempotently by (org_id, client_id) with the §8 conflict rules. Add "Saved on phone" / "Synced" states, an offline banner with the pending count, and a Pending sync screen. Add a Playwright test that goes offline, creates a trip and manifest, comes back online and checks server state. Add a CI step that reports captain-route bundle size.

**Acceptance criteria:**
- With the network off (after one earlier login), a captain opens the app, creates a trip, adds passengers, departs and arrives.
- On reconnect every op syncs once; replaying the same batch creates no duplicates.
- Captain routes are under 200 KB JS gzipped.
- The app passes the browser's PWA installability check.

### M6 — Safety lock
**Prompt:**
> Implement the §4.2 safety lock and §10.3. WeatherClient using Open-Meteo forecast + marine data; the `weather-poll` job filling `weather_cache`; sunrise/sunset calculation; `safety_thresholds` with defaults from the country rule set (§16) and org values that may only be stricter; sunrise/sunset in the jetty's time zone; a deterministic rules engine returning pass/warn/block with plain reasons; the safety-check, acknowledge, override-request and override-decision endpoints, with a WhatsApp interactive message to the owner; `depart` returns 409 without a valid check. Implement the offline rules from §8. Make `safety_checks` and `safety_overrides` append-only (revoke UPDATE and DELETE). Write table-driven unit tests for the engine.

**Acceptance criteria:**
- Departure is impossible after a block with no approved override, in both API and UI.
- Capacity breaches cannot be overridden.
- An org cannot save thresholds looser than the platform defaults.
- Overrides record requester, approver, reason and time; a DB test proves rows cannot be updated or deleted.
- An offline check with weather older than 3 hours returns warn "weather unknown".

### M7 — Ticketing and payments (payments abstraction, Paystack first)
**Prompt:**
> Implement §11 for tickets and subscriptions. PaymentProvider abstraction with `PaymentRouter` and the Paystack implementation first (checkout, verify, webhook with signature check and `webhook_events` idempotency, subaccount split where configured); Flutterwave as the second NGN route. Prices from `plan_prices` in the org's currency (NGN and USD seeded). Public passenger flow: route → trip → seats → pay → QR ticket; ticket lookup; agent sale (cash/transfer recorded); scan or type code to board, linked to the manifest. Fee calculation from `fee_config` and the org fee bearer. Plans and subscriptions (ferry per org, charter per vessel) with grace period and read-only mode that never blocks trips, manifests, safety or alerts. Daily `reconcile-payments` job.

**Acceptance criteria:**
- A test-mode card payment produces a paid ticket with a QR code; scanning it marks the passenger on the manifest.
- Sending the same webhook twice changes state once.
- Fee maths is unit-tested for both bearers and for NGN and USD; all amounts are integer minor units with a currency.
- No business code names a provider; switching the NG route to Flutterwave in config works in tests.
- With an expired subscription, billing-gated screens are read-only but trips, manifests and safety checks still work.

### M8 — Tracking and live map
**Prompt:**
> Implement `trip_positions` batch upload (queued offline, every 30 s while departed), the owner live map with Mapbox (vessels, last seen, trip status), trip track replay, and the public trip status page. Show "Tracking paused" when the browser stops updates.

**Acceptance criteria:**
- Positions recorded offline upload in order on reconnect.
- The owner map shows a new position within 60 s while online.
- The public status page contains no personal data.

### M9 — WhatsApp bot and voice-note logging
**Prompt:**
> Implement the WhatsApp Cloud API webhook (verify token, signature check, idempotency by wa_message_id), media download, SttClient transcription, §10.2 extraction with context, a confirmation reply with buttons, one-question-at-a-time follow-ups for missing fields, saving trips/expenses on Confirm, urgent incident escalation, routing document photos into the M3 OCR flow, and the Termii SMS fallback parser. Unknown numbers receive only a sign-up link.

**Acceptance criteria:**
- The fixture voice note "Trip four CMS to Ikorodu eighteen passengers twenty-seven thousand" yields a correct draft that saves only after Confirm.
- An incident message alerts the owner by WhatsApp and SMS within 1 minute (fake clients in tests) and creates an incidents row.
- A certificate photo sent to the bot appears in the review queue.
- Logs contain no phone numbers.

### M10 — Owner dashboard, reports and assistant
**Prompt:**
> Build the owner dashboard (today's trips, takings cash vs digital, alerts, compliance, idle vessels, pending overrides), daily and weekly reports with CSV export, and the §10.6 assistant in-app (streaming) and on WhatsApp, with read and draft tools only.

**Acceptance criteria:**
- Dashboard figures match database totals in tests.
- The assistant answers "Which certificates expire this month?" from tool results and refuses to move money or override safety.

**Phase 1 release gate:** pilot with 3–5 ferry operators; field test on a low-cost Android phone at a jetty; fix blockers before Phase 2 work takes priority.

### M11 — Charter listings, board and charterer accounts
**Prompt:**
> Implement the §4.3 charter vessel profile fields, `charter_listings`, the public board with filters and listing detail (verified badge, compliance score, public documents only), charterer org sign-up and role, charter requests, quotes, acceptance and decline, with WhatsApp notifications to the owner.

**Acceptance criteria:**
- A charterer finds a listing, sends a request, receives a quote and accepts it.
- A test proves private documents never appear on public pages or API responses.
- The owner sees new requests in-app and on WhatsApp.

### M12 — Contracts and invoicing
**Prompt:**
> Implement contract templates with variables, contract generation from accepted quotes, two-party in-app acceptance (name, timestamp, IP), PDF storage; invoices from charters and manual invoices, number series per org, optional VAT, PDF, send by WhatsApp/email, payment link, status tracking and the `invoices-overdue` job. Allow recording off-platform charters for invoicing with no commission.

**Acceptance criteria:**
- An accepted quote produces a contract both parties can accept; the PDF is stored.
- Invoice totals and VAT are unit-tested; overdue invoices are flagged and reminded once per configured interval.

### M13 — Escrow, commission and payouts
**Prompt:**
> Implement §11 escrow: checkout into the platform balance, `escrow_holds` with release rules, two-sided on-hire/off-hire confirmation, release with commission (`commission_bps` minus the in-app discount from `fee_config`), payouts by provider transfer to verified bank accounts, disputes that freeze funds, admin resolution (release, refund, split), `ledger_entries` and full audit. Keep escrow behind a feature flag that is off in production.

**Acceptance criteria:**
- Test-mode happy path: pay → hold → on-hire → release → payout minus commission; the ledger balances to the minor unit.
- A dispute freezes release; only an admin can resolve it; every step is audited.
- A repeated webhook or double click on release cannot pay twice.

### M14 — AI tender-pack builder
**Prompt:**
> Implement §10.5: tenders, the parse step with source_text quotes, requirement-to-document mapping with green/amber/red, drafting of the four sections from stored facts only with [MISSING: …] markers, a section editor, export to a merged PDF with an index plus a ZIP, and the export block while markers or red mandatory items remain unless the owner ticks "Submit anyway" (logged).

**Acceptance criteria:**
- A sample tender fixture produces a checklist in which every item quotes the tender.
- A fixture test shows drafts contain no facts missing from the input facts.
- Export is blocked and unblocked correctly; the exported PDF opens and has an index.

### M15 — Idle-vessel pricing and buyer suggestions
**Prompt:**
> Implement §10.4: the `idle-vessels` job, the rule-based price suggestion with visible inputs, the LLM rationale and listing description, buyer ranking without an LLM, one-tap publish to the board, and an optional drafted outreach message.

**Acceptance criteria:**
- A vessel idle for 3 or more days gets a suggestion showing its inputs; it is never below the owner's minimum rate.
- Past clients rank above other charterers in tests.

### M16 — Admin console, hardening and launch
**Prompt:**
> Build the §4.4 admin console. Complete §12: privacy notice, consents, export/delete requests, retention job, rate limits, PII-free logging, processor list page, admin passenger-data access with reason. Add Sentry, uptime checks, backup restore test, and feature flags for charter, escrow and Phase 3. Run the full e2e suite F1–F6 including offline. Write /docs/RUNBOOK.md (deploy, rollback, incident, breach response, webhook failure, key rotation).

**Acceptance criteria:**
- All e2e flows pass in CI against staging.
- Data export and delete requests work end to end.
- Admin reads of passenger data require and log a reason.
- The runbook exists and one restore from backup has been tested.

**Phase 2 release gate:** first paid crew-boat subscriptions; escrow switched on in production only after legal sign-off; first escrowed charter.

### M17–M19 — Phase 3 (months 9–12; write detailed prompts once Phase 2 is live)
- **M17 Barge load-matching:** `cargo_loads`, `load_bids`, `load_matches` on the Lagos–Onitsha and Warri corridors; matching by route, capacity and dates.
- **M18 Barge escrow and delivery proof:** reuse escrow; delivery confirmation by photo + geotag + receiver OTP.
- **M19 Public rental marketplace:** consumer listings, bookings, deposits, reviews, cancellation policy.

### M20–M22 — Phase 4, international expansion (after Nigeria goals are met)
- **M20 Stripe provider:** implement `StripeProvider` behind the same interface (checkout, subscriptions, Connect payouts where available); route USD subscriptions and USD charters to it; webhook normalisation into `PaymentEvent`. Acceptance: the full ticket, subscription and escrow test suites pass against both Paystack and Stripe fakes.
- **M21 Languages:** add `fr` and `pt-BR` message files, PDF templates and WhatsApp templates; locale switcher. Acceptance: no missing keys in enabled locales; invoices and contracts render in each locale.
- **M22 Second country pilot:** after validation, create and publish the first West African rule set, price book, payment route and messaging provider; enable the country as `pilot`. Acceptance: an org in the new country onboards, sees its own document requirements, pays in its configured currency, and gets alerts in its own time zone, with no code changes outside config and seed files.

---

## Appendix — Open decisions for the founder

The research does not settle these. Decide before the milestone in brackets.

1. **Escrow legal structure** (M13, and again per country): whether the platform may hold customer funds, or must use a provider's split/escrow product or a licensed trustee. Get legal advice.
2. **Safety thresholds** (M6): default wind, gust, wave and night rules, ideally aligned with LASWA guidance.
3. **Who pays the ticket fee** (M7): passenger or operator; may differ by org.
4. **Charter commission and in-app discount** (M13): the exact rate within 5–10%.
5. **Required manifest fields** (M4): whether names are mandatory; regulator requirements.
6. **Retention periods** (M16): manifests, GPS positions, documents.
7. **LLM, STT and OCR vendors** (M3, M9): choose after a short accuracy test on real Nigerian certificates and voice notes.
8. **Languages** (M10 onward): which local languages to add first.
9. **Pilot pricing** (M7): free or discounted period and terms for pilot operators.
10. **Company name and domain** (M16): replace "[Company Name]" throughout; check the name works internationally.
11. **USD prices** (M7): confirm or change the suggested $20 ferry and $100 per-vessel charter prices.
12. **Launch data region** (M0): which Supabase region to use, and the legal basis for any transfer out of Nigeria under the NDPA.
13. **Second market** (M22): which West African country first, after validation.
14. **Charter currency** (M11): whether Nigerian charters may be quoted in USD, subject to local law.
