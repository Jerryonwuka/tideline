# Tideline

Vessel-operations platform: ferry mode (manifests, tickets, safety lock) and charter mode (certificates, tender packs, escrow) on one core. Launch market Nigeria; everything country-specific is configuration.

- Project rules: [CLAUDE.md](CLAUDE.md)
- Full spec and milestone plan: [BUILD_SPEC.md](BUILD_SPEC.md)
- Changes per milestone: [docs/CHANGELOG.md](docs/CHANGELOG.md)

## Local setup

Needs Node 20+, pnpm 10, and Docker (for local Supabase).

```bash
pnpm install
cp .env.example .env.local
pnpm db:start        # local Supabase in Docker; prints the anon and service-role keys
pnpm db:check        # confirms Drizzle can connect
pnpm dev
```

| Command                       | What it does                                                      |
| ----------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                    | Run the app on http://localhost:3000                              |
| `pnpm lint && pnpm typecheck` | Must pass before any commit                                       |
| `pnpm test`                   | Unit tests (Vitest)                                               |
| `pnpm test:e2e`               | Playwright; starts its own dev server on port 3100                |
| `pnpm db:generate`            | Generate a migration from the Drizzle schema                      |
| `pnpm db:migrate`             | Apply migrations to local Supabase                                |
| `pnpm db:reset`               | Recreate the local database from migrations + `supabase/seed.sql` |
| `pnpm db:seed`                | Load development seed data                                        |

`INTEGRATIONS_MODE=fake` (the default) runs every external service — payments, WhatsApp/SMS, LLM, speech-to-text, OCR, weather — against in-memory fakes. OTP codes print to the dev server console.
