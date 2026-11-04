import { z } from "zod";

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
