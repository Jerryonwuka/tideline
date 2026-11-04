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

## Design system v2 (2026-11-04)
- Implements the Figma "Tideline Brand System v2": Abyss/Shell/Foam/Tide palettes, opacity-based text hierarchy, signal colours, 2/4/8 px radius, three shadow depths, tide easing curves.
- Light and dark themes (dark is the brand default; light uses Ink on Shell with Tide Blue), switchable and remembered per device; follows the device when set to "Match device".
- Newsreader (display), Inter (UI/body), JetBrains Mono (labels) via next/font; type utilities `display-xl` … `label-mono`.
- Logo artwork exported from Figma (reversed, Foam accent, mono-on-light) in `public/brand`, used through `<Logo>`.
- Components: bracketed mono buttons with a left-to-right accent sweep, inputs, status chips, dashed tags, cards, theme switch.
- Motion: drifting "line waves" hero that follows the pointer, reveals with hairlines that draw in, numbers that tick up; all off under reduced motion.
- New landing page built from the brand cover.
