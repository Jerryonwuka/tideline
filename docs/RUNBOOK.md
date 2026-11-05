# Tideline runbook

Operational procedures for staging and production. Keep this file current: every incident review
ends with an update here if a step was missing or wrong.

**Environments** (BUILD_SPEC §14): `local` (Supabase CLI + fake integrations), `staging` (provider
test keys, WhatsApp test number), `production`. One Supabase project and one Vercel project
environment each. Never copy keys between environments.

---

## 1. Launch checklist (before the first production release)

Items marked ☐ are not done in code and need a person. The step-by-step setup (accounts, Supabase,
Vercel variables, webhooks, WhatsApp templates) is in [GO_LIVE.md](GO_LIVE.md).

- ☐ **Legal review** of `/privacy`, `/terms` and the processor list (`src/config/privacy.ts`):
  lawful bases, retention period (placeholder 24 months, confirm against LASWA), the NDPA transfer
  conditions, the regulator-notification deadline (section 6). Bump `PRIVACY_NOTICE_VERSION` after
  changes.
- ☐ **Hosting region** chosen and set as `NEXT_PUBLIC_DATA_HOSTING` (shown on `/privacy`); fill the
  "to confirm" locations in the processor list; sign data-processing agreements.
- ☐ **Escrow legal sign-off.** Until then production keeps `ESCROW_ENABLED` unset or `off`. The
  console flag alone cannot switch escrow on in production.
- ☐ Meta business verification and WhatsApp template approval; Termii sender ID; Paystack and
  Flutterwave business verification and transfer approval (long lead times).
- ☐ Production secrets set (section 7), all different from staging.
- ☐ `SENTRY_DSN` set for staging and production; trigger a test error and see it arrive.
- ☐ Repository variable `HEALTH_URLS` set so the Uptime workflow runs; watchers get its failure emails.
- ☐ Supabase: daily backups and point-in-time recovery on production; first restore test recorded
  in section 5.
- ☐ Job config rows in each environment: `private.job_config` keys `app_url` and `cron_secret`
  (same value as `CRON_SECRET`), so pg_cron can call `/api/jobs/*`.
- ☐ Full e2e suite (F1–F6, offline, Android profile) green against **staging** — needs the staging
  test variant described in section 2.4; until then it is green in CI against local only.
- ☐ At least one platform admin: `insert into public.platform_admins (user_id) values ('<profile id>');`

## 2. Deploy

1. Open a PR. CI runs lint, typecheck, unit, RLS/database tests and the Playwright suite
   (desktop + Android, offline included) against a fresh local Supabase. Merges are blocked on failure.
   Vercel builds a **preview** on the staging environment; if the PR has migrations, the "Deploy
   database" workflow applies them to the **staging** database.
2. Review migrations by hand: RLS on every new table, `revoke … from anon, authenticated` first,
   then explicit grants; no `truncate` grants (a test enforces this); append-only tables have the
   `reject_mutation` trigger. Migrations must be backwards compatible (add first, remove in a later
   release): the app and the migration go live within minutes of each other.
3. Check the preview by hand (sign in, a ferry trip with a safety check, a test-card ticket, a charter
   quote). **Gap:** the Playwright suite signs in by reading codes from the local fake outbox and
   uses dev-only endpoints, so today it runs only against local (CI). Running it against staging
   needs Supabase Auth test phone numbers with fixed codes and a staging variant of the tests that
   avoids the dev endpoints; not built yet.
4. Merge to `main`. The "Deploy database" workflow waits for approval on the `production` GitHub
   environment, then applies migrations to production; Vercel deploys production at the same time.
5. Tag the release (`vX.Y.Z`) for the record.
6. Check `/api/health?deep=1`, then watch Sentry and the Uptime workflow for 30 minutes.

## 3. Rollback

- **App:** in Vercel, promote the previous production deployment ("Instant rollback"). Safe because
  migrations are backwards compatible (section 2.2).
- **Database:** never edit applied migrations. Write a new forward migration that undoes the change
  and deploy it like any other. For data damage, restore (section 5) into a scratch project, verify,
  then copy back only the affected rows.
- **Feature:** switch it off in Admin → Feature flags (`charter`, `escrow`, `phase3`); takes effect on
  the next request. For escrow in production also set `ESCROW_ENABLED=off` and redeploy.

## 4. Incident response

1. **Declare**: one person leads, one communicates. Open an incident note (time, symptoms, links).
2. **Assess severity**: Sev 1 = trips can't depart safely, payments wrong, or a data breach;
   Sev 2 = a main flow broken for many users; Sev 3 = degraded or one customer.
3. **Stabilise** before fixing: roll back (section 3) or switch the feature off.
4. **Communicate** to affected operators by WhatsApp/email; status every hour for Sev 1–2.
5. **Close** with a blameless review within 5 working days: timeline, cause, what we change
   (code, alerts, this runbook).

Where to look: Sentry (errors, tagged by event: `api.unhandled`, `webhook.payment`, `bot.message`,
`job.retention`, `next.request`, `privacy.requests_overdue`); Vercel logs (redacted: phone numbers
appear only as `phone#<hash>`); Supabase logs; Admin → Audit log.

## 5. Backups and restore

- Production: Supabase daily backups + point-in-time recovery (enable on the paid plan).
- **Restore test, monthly**: restore the latest production backup into a scratch Supabase project
  (Dashboard → Database → Backups → Restore to new project), then compare row counts with the
  source and open the app against it. Locally, `pnpm db:restore-test` dumps the app schemas,
  restores them into a fresh database and compares every table's row count.
- Record each test below.

| Date       | Source                         | What                                                                                                 | Result |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------ |
| 2026-11-04 | local (`supabase_db_tideline`) | `pnpm db:restore-test`: 1.4 MB dump, 73 tables restored, 0 row-count mismatches, 0 unexpected errors | PASS   |

## 6. Personal-data breach response

1. **Contain** within the hour: revoke leaked keys (section 8), disable the affected feature or
   endpoint, preserve logs.
2. **Assess**: what data, whose (passengers, crew, owners), how many, which countries, whether it
   is likely to harm people.
3. **Notify the regulator** without undue delay and within each law's deadline: GDPR 72 hours from
   awareness; Nigeria (NDPA, Nigeria Data Protection Commission) — confirm the current deadline with
   counsel before launch and write it here. Record the decision even if not notifying.
4. **Tell affected people** when there is a high risk to them: plain language, what happened, what
   we did, what they should do.
5. **Log** the breach (date, facts, effects, actions) in the incident note and the breach register.

## 7. Webhook failures

Payment webhooks (`/api/webhooks/payments/:provider`) are signature-checked and idempotent (stored
provider event ids), so replays are safe.

1. Sentry `webhook.payment` errors, or customers report "paid but no ticket".
2. Check the provider dashboard's webhook log for our response codes.
3. 401s: the signing secret is wrong (`PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`) — fix the env
   var and redeploy, then replay from the provider dashboard.
4. 5xx: fix forward or roll back, then replay. The hourly `reconcile-payments` job also confirms
   pending payments by asking the provider directly.
5. WhatsApp (`/api/webhooks/whatsapp`): `WHATSAPP_APP_SECRET` must match the Meta app; Meta retries
   for a while, then drops messages.

Cron jobs (`alerts-expiry`, `weather-poll`, `reconcile-payments`, `invoices-overdue`,
`idle-vessels`, `retention`) run from pg_cron through `private.run_job`. Check
`select * from cron.job_run_details order by start_time desc limit 20;` and `net._http_response`
for the app's replies.

## 8. Key rotation

Rotate on staff change, suspected leak, and yearly. One at a time, staging first.

| Secret                                         | Where                             | How                                                               |
| ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| Supabase service role / anon keys              | Supabase → API                    | Roll JWT secret (signs everyone out), update Vercel env, redeploy |
| `CRON_SECRET`                                  | Vercel env + `private.job_config` | Set both to the new value in the same window                      |
| `PHONE_HASH_SALT`                              | Vercel env                        | Changing it re-keys phone hashes and rate limits; only on a leak  |
| `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_*`         | Provider dashboards               | Generate new, update env, redeploy, revoke old                    |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Meta app                          | Reset, update env, re-verify webhook                              |
| `SEND_SMS_HOOK_SECRET`                         | Supabase Auth hooks               | Regenerate, update env                                            |
| `SENTRY_DSN`                                   | Sentry project                    | Revoke key, create new                                            |

After rotating: deploy, check `/api/health?deep=1`, sign in, take a test payment in staging.

## 9. Data-subject requests

People ask from Settings → Privacy. Admin → Privacy requests lists them with due dates (30 days);
overdue ones are reported to Sentry every morning by the `retention` job.

- **Export**: "Prepare export" builds a JSON file of everything held about the person; they download
  it from Settings → Privacy (5-minute signed link).
- **Deletion**: "Delete account" blanks their name and numbers in manifests and tickets (and in the
  audit snapshots of those rows), clears references, removes consents and exports, then deletes the
  account. Money and safety records stay without their details. Sole owners of a company are refused
  until ownership is handed over.
- **Passenger data reads by staff** need a reason (Admin → Passenger data); every read is logged.
