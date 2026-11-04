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
