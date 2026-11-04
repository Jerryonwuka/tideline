# Changelog

## M0 — Repository and foundations (2026-11-04)

- Next.js 15 App Router, strict TypeScript, Tailwind 4, shadcn/ui, ESLint + Prettier, pnpm.
- Vitest (unit) and Playwright (e2e, desktop + Pixel 5 profiles) with a smoke test for `/` and `/api/health`.
- Supabase CLI config (`supabase/config.toml`, project id `tideline`) and Drizzle ORM writing Supabase-style migrations to `supabase/migrations`. `pnpm db:check` proves the connection.
- Integration interfaces with in-memory fakes under `src/server/integrations`: PaymentProvider (+ PaymentRouter), MessagingClient (WhatsApp + SMS), LlmClient, SttClient, OcrClient, WeatherClient. ESLint blocks vendor SDK imports anywhere else.
- `src/lib/money.ts` (bigint minor units, currency-safe arithmetic, banker's-rounded bps fees, locale formatting) and `src/lib/dates.ts` (UTC storage, IANA-zone display, calendar-date helpers), with tests across NGN/USD and two time zones.
- next-intl with `en` and `en-NG` (regional file overrides only the keys it changes); locale resolves user → org → browser → `en`.
- `/api/health`, GitHub Actions CI (lint, format, typecheck, unit, e2e), `.env.example` covering every service in the spec.
- Working name "Tideline" used in place of "[Company Name]" (Appendix item 10 still open).

## Landing page and visual language (2026-11-04)

- New visual language (replaces the first Figma-based draft at the founder's request): deep navy-black field with soft blue glows, hairline-framed page with side rails, corner "crop marks", Newsreader display serif, Inter body, JetBrains Mono labels. Light theme mirrors it on paper white; dark is the default and the choice is remembered.
- Landing page sections: hero with perspective water grid and phone sign-up; vessel-type band (10 original line drawings that draw themselves in); three illustrated platform cells (live captain feed, isometric safety-check stack, orbiting connected services); "How a voyage runs" flow diagram with animated connectors and four steps; tabbed Ferry / Charter / Compliance tour in a contrasting band; field notes; FAQ accordion; closing call to action.
- Logo artwork from Figma kept in `public/brand` and used through `<Logo>`.
- Motion: scroll reveals with blur-in, self-drawing strokes, cycling highlights, slow orbit; all off under reduced motion.
- The sign-up form hands the phone number to `/login` through sessionStorage, never the URL. `/login` arrives with M1.

## Interactive blueprints and layout pass (2026-11-04)

- Hero now pairs left-aligned copy with an interactive 3D general-arrangement drawing of a passenger vessel, built in code with three.js (lofted hull with frames and bulbous bow, stepped decks, portholes, lifeboats, funnel, radar domes, mast). Drag to turn it through 360°; it drifts round on its own when idle. Four hotspots (bridge, lifeboats, hull, engine room) explain the matching Tideline feature. Blue lines on white in light mode, pale blue on navy in dark mode.
- Platform section: the layer stack and service globe are replaced by two more rotatable blueprints: a lifeboat on its davits with the four departure checks ticking to "cleared to depart", and a communications mast (turning radar, GPS and satcom domes, antennas sending signal rings) labelled with the services each carries.
- Layout pass so the page has its own structure: left-aligned numbered section heads, a scrolling vessel-type strip, a bento platform grid, a timeline for the process steps, row-style field notes and a split closing section.
- 3D code is lazy-loaded in the browser only, renders only while on screen, caps pixel density at 1.5 and draws on demand when the visitor prefers reduced motion.
- E2E tests wait for hydration and run with reduced motion.
- Follow-up: hero floor grid removed (the ship has its own drafting grid); the safety-lock drawing now fills its tall cell with the checks overlaid at the top; the closing section's grid is replaced by flowing water lines.

## M1 — Auth, organisations, roles and RLS (2026-11-04)

- §5.1 tables (profiles, orgs, memberships, platform_admins, invitations) and §5.6 audit_logs via Drizzle; security in a hand-written migration.
- `has_role(org_id, roles[])` and `is_platform_admin()`; RLS on every table. Owners manage the org and team; managers invite captains and crew; captains and crew see only their own membership; signed-out visitors read nothing. Users can edit only their own name/locale/time zone, never their phone. Verification status is admin-only. Every org keeps at least one owner.
- RPCs: `create_org` (org + first owner in one transaction), `create_invitation` (runs as the caller, so policies decide), `accept_invitation` (checks token, expiry, single use and that the phone matches), `invitation_preview` (org name and role only).
- Append-only `audit_logs` written by triggers for org, membership and invitation changes (created, role changed, accepted, …) with actor and client IP; UPDATE/DELETE/TRUNCATE are rejected even for the database owner.
- Phone OTP: Supabase Auth generates the code and calls our signed send-SMS hook (`/api/auth/hooks/send-sms`), which delivers it through MessagingClient (Termii in production, the fake locally, which prints the code). Invitations go by WhatsApp template with SMS fallback.
- REST: `POST /api/v1/auth/otp/send|verify`, `GET|PATCH /me`, `POST /orgs`, `GET|PATCH /orgs/:id`, `GET /orgs/:id/members`, `POST /orgs/:id/invitations`, `POST /invitations/:token/accept`, `PATCH|DELETE /memberships/:id`. Zod on every input; errors as `{error: {code, message, fields?}}`; Bearer tokens accepted for API clients.
- Screens: login (phone → code), onboarding (name, then company and modes), dashboard, team (invite, change role, remove, revoke), invite link page.
- Tests: 11 RLS tests against real Postgres (`pnpm test:rls`), unit tests for phone parsing, webhook signatures, redirects and error mapping, and a Playwright flow: owner signs up by OTP, creates an org, invites a captain who accepts and logs in. CI now starts Supabase for RLS and e2e.
- `pnpm db:seed` creates two orgs, owners, a captain and a platform admin (test phone numbers in `scripts/seed.mts`). Email login and the org settings screen are not in this milestone.

## M1b — Countries, currencies, locales, time zones and the compliance module (2026-11-04)

- §5.0 tables: `currencies` (NGN, USD), `locales` (en, en-NG; fr and pt-BR planned), `countries`, `exchange_rates` (reporting only), `payment_provider_routes` (NG/NGN → Paystack, then Flutterwave, for every purpose).
- Countries: Nigeria enabled (pilot, NGN, en-NG, Africa/Lagos, data region af). ZZ "Testland" (USD, fr, America/Chicago, region us) is disabled and used only in tests to catch hard-coded Nigerian values. A country can't be switched on until it has a published rule set, an enabled currency and language, and a payment route.
- Orgs now carry currency, time zone, default locale and data region, filled from their country by `create_org`; existing orgs were backfilled. Owners may change currency, locale and time zone; country and data region are admin-only.
- §16 compliance module: versioned rule sets (draft → published → retired, one published per country), regulators, document types, document requirements (by vessel type and mode), charter eligibility rules, safety defaults and tax rules. A published global baseline (insurance for every vessel, plus the global document types) applies everywhere.
- Nigeria v1 rule set seeded as **draft**: NIMASA and LASWA; vessel registration, safety equipment, LASWA licence (ferry), NIMASA certificate and Cabotage registration (charter), crew competency and STCW; a Cabotage eligibility warning; placeholder safety defaults (30/40 km/h, 1.0 m, 06:30–18:30, night block); VAT 7.5%. Wording and values await legal and LASWA review; an admin publishes it.
- Engine (`src/server/compliance`): `requirementsFor` (published global + published country only), `complianceScore`, `charterEligibility`, and `looserThan` for stricter-only safety settings. Drafts and retired versions never apply.
- Admin console (`/admin`, platform admins only, 404 for everyone else): countries (open for sign-up, launch status) and rule sets (versions, publish with a legal review note, start a new version, view details). Published versions are frozen.
- Endpoints: `GET /api/v1/countries`, `GET /countries/:code/config`, `GET /compliance/requirements?country=&vessel_type=&modes=`, and admin `GET|PUT /admin/countries`, `GET /admin/rule-sets`, `GET /admin/rule-sets/:id`, `POST /admin/rule-sets/:id/versions`, `POST /admin/rule-sets/:id/publish`.
- Onboarding lists enabled countries from the database and shows the currency and time zone they bring.
- Tests: 8 database tests (defaults per country, readiness guard, requirements before/after publishing, versioning, admin-only access), engine unit tests, an e2e admin happy path, and a unit test that fails on hard-coded `NG`, `NGN` or `Africa/Lagos` anywhere in `src/` outside `src/config/`.
- Not in this milestone: editing individual requirements in the admin UI (the database allows it on drafts; the screen comes later), exchange-rate import, and real payment providers (M7).

## M2 — Vessels, crew and documents (2026-11-04)

- §5.2 tables: `vessels`, `crew_members`, `vessel_crew`, `documents`, `document_alerts` (used by M3). Vessels operate in a country (default: the org's) that decides which rule set applies.
- RLS: every member sees the fleet; owners and managers add and change vessels, crew and documents; only owners delete. Crew records (personal data) are visible to owners/managers and to the person themselves. Captains and crew see documents for vessels they're assigned to and their own certificates. Documents can only point at vessels/crew in the same org. Document, vessel and crew changes are audited.
- Document status as of today in the org's time zone (`documents_live` view, `effective_document_status`): needs review and rejected stay as decided; otherwise expired / expiring (within 30 days) / valid. Dates typed in by a person count as reviewed; without an expiry date a document waits in "Needs review". A new reviewed copy replaces older ones of the same type.
- Files: private `documents` bucket, paths `{org}/{subject}/{id}/…`, storage RLS mirrors document access. Photos are shrunk on the device to ≤1600 px (~70% JPEG) and uploaded straight to storage with a single-use signed URL; viewing uses 5-minute signed URLs.
- Compliance score per vessel (required documents from the published rule sets, scored against current documents) on the vessel list, vessel page and dashboard, with a requirements checklist and add/renew links.
- Screens: vessels (list, add, detail with compliance, documents and crew assignment), crew (list, add with optional app invite, detail), documents (all / expiring / expired / needs review, upload, detail with preview and review). Onboarding steps 3–5: first vessel, first certificate, invite your captain (creates the crew record and the invitation; the record links when they accept). Dashboard shows fleet compliance and what needs attention.
- Endpoints: `GET|POST /api/v1/vessels`, `GET|PATCH|DELETE /vessels/:id`, `GET|POST /vessels/:id/crew`, `GET|POST /crew`, `GET|PATCH|DELETE /crew/:id`, `POST /documents/upload-url`, `GET|POST /documents`, `GET|PATCH /documents/:id`, `POST /documents/:id/confirm`, `GET /compliance/summary`, and `GET /compliance/requirements?vessel_id=`.
- Tests: 5 database tests (org isolation, captain/crew visibility, status by calendar and time zone, storage privacy, audit), unit tests for status, date order, image sizing and vessel input, and an e2e flow covering onboarding steps 3–5, a 2400 px photo stored at ≤1600 px, valid/expiring/expired statuses, compliance on vessel page and dashboard, and signed URLs that expire after 300 s with no public access.

## M3 — OCR extraction and expiry alerts (2026-11-04)

- §10.1 certificate extraction: OCR text + the image go to the LLM (via `OcrClient`/`LlmClient`) with a versioned prompt (`ocr-extract@1`) that names the country's document types and its numeric date order (day-first for Nigeria) and forbids guessing dates. Output is validated with Zod (real calendar dates only); invalid output gets one retry with the error, then the document falls back to manual entry.
- Every call is logged in `ai_jobs` (prompt version, model, tokens, latency, cost estimate, status/error). Per-org monthly cap (`AI_MONTHLY_JOB_LIMIT`) until plans carry budgets. Prompts carry document-type codes and the subject name only.
- The draft is stored in `documents.extracted` with review hints: fields under 0.8 confidence (and a missing expiry) are highlighted; flags for name mismatch, already expired, different document type, no expiry; a suggested expiry from the issue date and the type's usual validity (never filled in automatically). Nothing becomes valid until a person confirms. The document page shows what was read and pre-fills the review form.
- Local development uses a fake extractor that returns a clearly labelled, plausible draft; tests register their own fixtures.
- `alerts-expiry` job: pg_cron runs hourly (UTC) and calls `/api/jobs/alerts-expiry` (Bearer `CRON_SECRET`) through pg_net, configured per environment in `private.job_config` (`app_url`, `cron_secret`; skipped when absent). The job picks orgs whose local time is 07:00, finds documents exactly 90/60/30/14/7/1/0 days from expiry (or the org's `settings.alert_offsets`), and claims each (document, offset, channel) in `document_alerts` before sending, so re-runs and overlaps never double-send. WhatsApp template to owners/managers with SMS fallback, plus in-app notifications.
- Notifications page and an unread badge in the app bar.
- Tests: extraction (valid, retry then success, two failures → manual, impossible date), prompt date-order wording, review hints, alert offsets; database-backed job tests (sent once across two runs, an org in another time zone alerted at its own 07:00, SMS fallback); e2e upload → AI draft with highlights → confirm → valid, with the `ai_jobs` row checked.
- Not yet: requirement-level alert offsets from the rule set (org offsets are used), and a real LLM/OCR vendor (Appendix item 7: choose after an accuracy test on real certificates).

## M4 — Ferry routes, trips and manifests (2026-11-04)

- §5.3 tables: `jetties` (shared, proposed by orgs, activated by admins; six Lagos jetties seeded as proposed), `routes`, `schedules`, `trips`, `manifest_entries`. Fares are minor units with a currency; times are UTC shown in the jetty's zone.
- Rules in the database: the manifest can never exceed the vessel's licensed capacity (no override); it locks at departure and later additions are recorded as audited amendments; trip status only moves forward (scheduled → boarding → departed → arrived → closed, or cancelled); departure needs the lifejacket check; passenger counts are fixed at departure and arrival; closed trips can't be edited.
- Who does what: owners/managers run routes, schedules and every trip; captains move their own vessel's trips; crew add passengers; a captain sees only their own vessel's trips and takings, never org totals.
- `materialise_schedule_trips` creates each day's trips from active schedules once (re-runs are no-ops), with the assigned captain.
- Screens: routes and schedules, trips (list, detail with manifest), daily report with CSV export; captain mode (`/captain`): today's trips, start an unscheduled trip, a step-by-step trip screen (board → lifejackets → depart → arrive with count) and a live seats counter.
- Endpoints: `GET|POST /api/v1/jetties`, `GET|POST /routes`, `GET|PATCH|DELETE /routes/:id`, `GET|POST /schedules`, `GET|PATCH|DELETE /schedules/:id`, `GET|POST /trips`, `GET|PATCH /trips/:id`, `POST /trips/:id/depart|arrive|cancel`, `GET|POST /trips/:id/manifest`, `PATCH|DELETE /manifest/:id`, `GET /reports/daily`, `GET /reports/export.csv`.
- Tests: 7 database tests (captain visibility, capacity hard block, lock and amendments, forward-only status, crew vs captain permissions, schedule materialisation, jetty proposals) and an e2e happy path (captain fills a trip to capacity, is blocked at one more, departs, arrives; owner sees it in the daily report).
- Not yet: the admin jetty verification screen (proposals are activated in the database for now), and offline capture (M5).
