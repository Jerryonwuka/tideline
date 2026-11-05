# Going live

The order to take Tideline from code to a public launch. Do it twice: **staging** first (test keys,
its own Supabase project, Vercel Preview), then **production**. Never share keys between them.

Launch choices (decided 2026-11-05): Claude (`claude-sonnet-5-5`) for AI and document reading,
OpenAI Whisper for voice notes, Resend for email, Termii for SMS, WhatsApp Cloud API, Paystack
first, data in Supabase **London (eu-west-2)**, Vercel functions in London (`lhr1`).

Check any environment's keys with `pnpm check:live <env file>` (read-only; sends nothing), and the
running site with `https://<domain>/api/health?deep=1` (lists missing settings by name).

---

## 0. Start today (approvals take days to weeks)

| What                                             | Where                                   | Why it can take long                         |
| ------------------------------------------------ | --------------------------------------- | -------------------------------------------- |
| Termii account + **sender ID** (e.g. `Tideline`) | termii.com → Sender ID                  | Manual approval; DND route for sign-in codes |
| Meta Business **verification**                   | business.facebook.com → Security Centre | Company documents (CAC)                      |
| WhatsApp Business number + 2 **templates**       | WhatsApp Manager → Message templates    | Template review; see section 6               |
| Paystack business **activation** + transfers     | dashboard.paystack.com → Compliance     | KYC, then payouts approval                   |
| Flutterwave (optional second provider)           | dashboard.flutterwave.com               | KYC                                          |
| Domain (e.g. `tideline.ng`)                      | a `.ng` registrar                       | `.ng` registration needs documents           |
| Legal review of `/privacy`, `/terms`             | your counsel                            | NDPA transfer basis for London hosting       |

Without WhatsApp approval you can still launch: every WhatsApp message goes by SMS instead
(`/api/health?deep=1` shows `"whatsapp": "sms_only"`).

## 1. Accounts and keys

| Service   | Plan needed                                                               | Key(s) → Vercel variable                                                                            |
| --------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Vercel    | **Pro** (Hobby forbids commercial use)                                    | —                                                                                                   |
| Supabase  | **Pro** for production (backups + PITR), Free OK for staging              | URL, anon key, service-role key, DB URL, hook secret                                                |
| Anthropic | console.anthropic.com, add billing; ask sales for zero data retention     | `ANTHROPIC_API_KEY`                                                                                 |
| OpenAI    | platform.openai.com, add billing; turn off training on API data (default) | `OPENAI_API_KEY`                                                                                    |
| Resend    | resend.com; verify a sending domain (DNS)                                 | `RESEND_API_KEY`, `EMAIL_FROM`                                                                      |
| Termii    | as above                                                                  | `TERMII_API_KEY`, `TERMII_SENDER_ID`, `TERMII_BASE_URL`                                             |
| Meta      | as above; a System User token with `whatsapp_business_messaging`          | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` |
| Paystack  | **test** keys on staging, live keys on production                         | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`                                                        |
| Mapbox    | free tier; restrict the token to your domains                             | `NEXT_PUBLIC_MAPBOX_TOKEN`                                                                          |
| Sentry    | free tier                                                                 | `SENTRY_DSN`                                                                                        |

## 2. Supabase project (per environment)

1. supabase.com → New project → region **West EU (London)** `eu-west-2`, strong DB password (save it in
   your password manager).
2. Apply the schema from your machine (the "Deploy database" workflow does this automatically later):

   ```bash
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase db push
   ```

   All reference data (Nigeria, NGN/USD, compliance rules, payment routes, flags, storage buckets) is in
   the migrations; there is no seed to run in hosted environments.

3. **Authentication → Providers → Phone**: enable. Leave the SMS provider unset (our hook sends codes).
   OTP expiry 300 seconds, code length 6.
4. **Authentication → Hooks → Send SMS hook**: type HTTPS, URL `https://<domain>/api/auth/hooks/send-sms`,
   generate a secret → copy it to Vercel as `SEND_SMS_HOOK_SECRET` (the full `v1,whsec_…` value).
5. **Authentication → URL configuration**: Site URL `https://<domain>`; add `https://<domain>/**` to
   redirect URLs (staging: also `https://*-<vercel-team>.vercel.app/**`).
6. **SQL editor**, once (lets pg_cron call the app's jobs; pick a long random `CRON_SECRET`):

   ```sql
   insert into private.job_config (key, value) values
     ('app_url', 'https://<domain>'),
     ('cron_secret', '<same value as CRON_SECRET>')
   on conflict (key) do update set value = excluded.value;
   ```

7. Production only: **Database → Backups**: enable point-in-time recovery.
8. Sign up on the live site with your own phone, then make yourself platform admin:

   ```sql
   insert into public.platform_admins (user_id)
   select id from public.profiles where phone_e164 = '+234…';
   ```

   Then Admin → Compliance → publish the Nigeria rule set after checking it.

## 3. Vercel project

The project `tideline` is already imported from GitHub. Do **not** use the "Add Supabase" integration
button (it creates a new project in a region we didn't choose and uses different variable names).

Settings → Environment Variables. **Production** gets production values; **Preview** gets staging
values. Required in both:

```
APP_ENV                     production | staging
INTEGRATIONS_MODE           live
PAYMENTS_MODE               live          (Paystack test keys in Preview)
NEXT_PUBLIC_APP_URL         https://<domain>   (Preview: https://staging.<domain>)
NEXT_PUBLIC_SUPABASE_URL    https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   (mark Sensitive)
DATABASE_URL                Supabase → Connect → Session pooler URI
SEND_SMS_HOOK_SECRET
CRON_SECRET
PHONE_HASH_SALT             long random string; never change after launch
NEXT_PUBLIC_DEFAULT_COUNTRY NG
NEXT_PUBLIC_DATA_HOSTING    Supabase, eu-west-2 (London, UK)
DATA_REGION                 eu
ANTHROPIC_API_KEY  OPENAI_API_KEY  RESEND_API_KEY  EMAIL_FROM
TERMII_API_KEY  TERMII_SENDER_ID  TERMII_BASE_URL  SMS_WEBHOOK_TOKEN
PAYSTACK_SECRET_KEY  PAYSTACK_PUBLIC_KEY
NEXT_PUBLIC_MAPBOX_TOKEN  SENTRY_DSN
ESCROW_ENABLED              off   (until legal sign-off)
```

Add when WhatsApp is approved: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. Then Deploy. Functions run in London (`vercel.json`).

Domains: add `<domain>` to Production and `staging.<domain>` to Preview (Settings → Domains → assign
the `staging` git branch, or use a preview URL).

## 4. Database migrations on every deploy

GitHub → Settings → Environments → create `staging` and `production`. In each add secrets
`SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD`; add the repository secret `SUPABASE_ACCESS_TOKEN`
(supabase.com → Account → Access tokens). On `production`, add yourself as a required reviewer.
The "Deploy database" workflow then applies migrations to staging on pull requests and to production
on merge to `main`.

## 5. Webhooks (point each provider at the app)

| Provider                            | URL                                                           | Secret                                                          |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Paystack → Settings → API           | `https://<domain>/api/webhooks/payments/paystack`             | signed with the secret key                                      |
| Flutterwave (if used)               | `https://<domain>/api/webhooks/payments/flutterwave`          | `FLUTTERWAVE_WEBHOOK_HASH`                                      |
| Meta app → WhatsApp → Configuration | `https://<domain>/api/webhooks/whatsapp`                      | verify token = `WHATSAPP_VERIFY_TOKEN`; subscribe to `messages` |
| Termii inbound SMS                  | `https://<domain>/api/webhooks/sms?token=<SMS_WEBHOOK_TOKEN>` | the token in the URL                                            |

## 6. WhatsApp templates to submit (category Utility, language English)

Names must match exactly; variables in this order.

- `document_expiry`: "{{1}} for {{2}} expires on {{3}} ({{4}} days). Renew it and upload the new copy: {{5}}"
- `member_invite`: "{{1}} invited you to join {{2}} on Tideline as {{3}}. Accept here: {{4}}"

Other WhatsApp messages are replies inside the 24-hour window; outside it they go by SMS
automatically.

## 7. Before announcing

- [ ] `pnpm check:live .env.production.local` all OK (`vercel env pull .env.production.local --environment=production`)
- [ ] `/api/health?deep=1` → `"status": "ok"`, empty `missing_config`
- [ ] Sign in with a Nigerian number (DND and non-DND), create an org, add a vessel, upload a certificate photo
      and check the extracted dates
- [ ] A ferry trip end to end: manifest, safety check, captain app offline then online
- [ ] Ticket bought with a Paystack **test** card on staging; one real ₦100 ticket on production, then refund it
- [ ] Invoice sent by email arrives (check spam; set SPF/DKIM/DMARC from Resend)
- [ ] Send a voice note to the WhatsApp number (when approved) and confirm the trip
- [ ] Sentry receives a test error; Uptime workflow green (`HEALTH_URLS` repository variable set)
- [ ] Restore test recorded in docs/RUNBOOK.md §5
- [ ] Legal sign-off recorded; `PRIVACY_NOTICE_VERSION` bumped if the notice changed
