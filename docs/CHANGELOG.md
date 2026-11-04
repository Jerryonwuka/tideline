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
