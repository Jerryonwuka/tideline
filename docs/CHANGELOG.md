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
