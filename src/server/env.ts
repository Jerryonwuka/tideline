import { z } from "zod";

/** Vercel and .env files often hold empty strings for unset values. */
const blankIsUnset = <T extends z.ZodType>(inner: T) => z.preprocess((v) => (v === "" ? undefined : v), inner);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    /** `fake` wires every integration to its in-memory fake (local dev and tests only). */
    INTEGRATIONS_MODE: z.enum(["fake", "live"]).default("fake"),
    NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: z.string().default("http://127.0.0.1:54321"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(""),
    DATABASE_URL: z.string().optional(),
    PHONE_HASH_SALT: z.string().optional(),
    SEND_SMS_HOOK_SECRET: z.string().optional(),
    /** Weather needs no key, so it can be live while other integrations are fake. */
    WEATHER_PROVIDER: z.enum(["fake", "open-meteo"]).optional(),
    /** Payments can be live (provider test or live keys) while other integrations are fake. */
    PAYMENTS_MODE: z.enum(["fake", "live"]).default("fake"),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    FLUTTERWAVE_SECRET_KEY: z.string().optional(),
    FLUTTERWAVE_WEBHOOK_HASH: z.string().optional(),
    /** WhatsApp Cloud API webhook: app secret (signature) and the verify token for the handshake. */
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    /** Shared token in the SMS gateway's inbound URL (?token=). */
    SMS_WEBHOOK_TOKEN: z.string().optional(),
    /** Escrow is off in production unless this is "on" (legal structure first, §11). */
    ESCROW_ENABLED: z.enum(["on", "off"]).optional(),
    /** Live integrations (INTEGRATIONS_MODE=live). Vendors chosen for launch: see docs/GO_LIVE.md. */
    ANTHROPIC_API_KEY: blankIsUnset(z.string().optional()),
    /** Claude model for every AI job; one model keeps one prompt cache. */
    LLM_MODEL: blankIsUnset(z.string().default("claude-sonnet-5-5")),
    /** Server-side refusal fallback (Claude API only). Set "off" on Bedrock/Vertex. */
    LLM_FALLBACKS: blankIsUnset(z.enum(["on", "off"]).default("on")),
    OPENAI_API_KEY: blankIsUnset(z.string().optional()),
    STT_MODEL: blankIsUnset(z.string().default("whisper-1")),
    TERMII_API_KEY: blankIsUnset(z.string().optional()),
    TERMII_SENDER_ID: blankIsUnset(z.string().optional()),
    TERMII_BASE_URL: blankIsUnset(z.string().url().default("https://api.ng.termii.com")),
    /** WhatsApp is optional at first: until Meta approves, everything goes by SMS. */
    WHATSAPP_ACCESS_TOKEN: blankIsUnset(z.string().optional()),
    WHATSAPP_PHONE_NUMBER_ID: blankIsUnset(z.string().optional()),
    WHATSAPP_API_VERSION: blankIsUnset(z.string().default("v23.0")),
    RESEND_API_KEY: blankIsUnset(z.string().optional()),
    /** e.g. "Tideline <no-reply@mail.tideline.ng>"; the domain must be verified in Resend. */
    EMAIL_FROM: blankIsUnset(z.string().optional()),
    /** Error reporting (Sentry). Unset: errors are recorded in memory (local) and logged. */
    SENTRY_DSN: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  })
  .refine((env) => env.APP_ENV === "local" || env.INTEGRATIONS_MODE === "live", {
    message: "Fake integrations are only allowed when APP_ENV=local",
    path: ["INTEGRATIONS_MODE"],
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}

/** Dev-only tooling (the fake outbox) is reachable only with local fakes. */
export function devToolsEnabled(): boolean {
  const env = serverEnv();
  return env.APP_ENV === "local" && env.INTEGRATIONS_MODE === "fake";
}

/**
 * With local fakes nothing talks to Meta or the SMS gateway, so fixed secrets are used and tests
 * can sign inbound messages. Real secrets apply whenever integrations are live.
 */
export const FAKE_WHATSAPP_SECRET = "fake-whatsapp-secret";
export const FAKE_SMS_TOKEN = "fake-sms-token";

export function inboundSecrets() {
  const env = serverEnv();
  if (devToolsEnabled()) {
    return { whatsAppSecret: FAKE_WHATSAPP_SECRET, whatsAppVerifyToken: "fake-verify-token", smsToken: FAKE_SMS_TOKEN };
  }
  return {
    whatsAppSecret: env.WHATSAPP_APP_SECRET ?? "",
    whatsAppVerifyToken: env.WHATSAPP_VERIFY_TOKEN ?? "",
    smsToken: env.SMS_WEBHOOK_TOKEN ?? "",
  };
}
