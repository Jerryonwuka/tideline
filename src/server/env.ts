import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  /** `fake` wires every integration to its in-memory fake (local dev and tests). */
  INTEGRATIONS_MODE: z.enum(["fake", "live"]).default("fake"),
  DATABASE_URL: z.string().optional(),
  PHONE_HASH_SALT: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
