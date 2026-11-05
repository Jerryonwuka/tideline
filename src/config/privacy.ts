// §12 data protection settings. Legal wording lives in messages/{locale}.json; this file holds the
// facts the notice and jobs rely on. Items marked "to confirm" must be settled with counsel and the
// hosting choice before launch (see docs/RUNBOOK.md, launch checklist).

/** Bump when the privacy notice changes materially; consents record which version was shown. */
export const PRIVACY_NOTICE_VERSION = "2026-11-04";

/** Manifests and GPS tracks are anonymised after this many months unless the org sets
 *  `settings.retention_months` (placeholder 24, to confirm against LASWA requirements). */
export const DEFAULT_RETENTION_MONTHS = 24;
export const MIN_RETENTION_MONTHS = 6;

/** Data-subject requests are due within this many days (GDPR one month; NDPA to confirm). */
export const DATA_REQUEST_DUE_DAYS = 30;

/** Where the database is hosted: set NEXT_PUBLIC_DATA_HOSTING per environment (e.g. "Supabase, eu-west-2 (London)"). */
export const dataHosting = () => process.env.NEXT_PUBLIC_DATA_HOSTING ?? null;

export type ProcessorStatus = "in_use" | "when_enabled";

/** Processor list and transfer register (§12). Shown publicly at /privacy/processors. */
export const PROCESSORS: {
  name: string;
  purpose:
    | "hosting_db"
    | "hosting_web"
    | "payments"
    | "messaging"
    | "sms"
    | "maps"
    | "ai"
    | "monitoring"
    | "analytics"
    | "email"
    | "weather";
  data:
    | "all_app_data"
    | "requests"
    | "payment"
    | "phone_messages"
    | "location"
    | "documents_voice"
    | "errors"
    | "usage"
    | "email"
    | "none_personal";
  location: string;
  status: ProcessorStatus;
}[] = [
  {
    name: "Supabase",
    purpose: "hosting_db",
    data: "all_app_data",
    location: "eu-west-2 (London, UK)",
    status: "in_use",
  },
  {
    name: "Vercel",
    purpose: "hosting_web",
    data: "requests",
    location: "functions in London (lhr1); edge network worldwide; company in USA",
    status: "in_use",
  },
  { name: "Paystack", purpose: "payments", data: "payment", location: "Nigeria", status: "when_enabled" },
  { name: "Flutterwave", purpose: "payments", data: "payment", location: "Nigeria, USA", status: "when_enabled" },
  {
    name: "Meta (WhatsApp Cloud API)",
    purpose: "messaging",
    data: "phone_messages",
    location: "USA, EU",
    status: "when_enabled",
  },
  { name: "Termii", purpose: "sms", data: "phone_messages", location: "Nigeria", status: "when_enabled" },
  { name: "Mapbox", purpose: "maps", data: "location", location: "USA", status: "when_enabled" },
  {
    name: "Anthropic (Claude: document reading, drafting, assistant)",
    purpose: "ai",
    data: "documents_voice",
    location: "USA",
    status: "in_use",
  },
  {
    name: "OpenAI (speech-to-text for voice notes)",
    purpose: "ai",
    data: "documents_voice",
    location: "USA",
    status: "in_use",
  },
  { name: "Sentry", purpose: "monitoring", data: "errors", location: "USA or EU (to confirm)", status: "when_enabled" },
  { name: "PostHog", purpose: "analytics", data: "usage", location: "EU (to confirm)", status: "when_enabled" },
  {
    name: "Resend",
    purpose: "email",
    data: "email",
    location: "USA",
    status: "in_use",
  },
  { name: "Open-Meteo", purpose: "weather", data: "none_personal", location: "EU", status: "in_use" },
];
