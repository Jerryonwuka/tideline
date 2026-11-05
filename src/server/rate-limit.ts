import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { LIMITS, type LimitName } from "@/config/limits";
import { devToolsEnabled } from "@/server/env";
import { ServiceError } from "@/server/services/errors";
import { supabaseAdmin } from "@/server/supabase/admin";

// Fixed-window limits kept in Postgres (works across serverless instances). Keys are HMACs, so the
// table never holds a phone number, user id or IP address.

const keyFor = (name: LimitName, subject: string) =>
  `${name}:${createHmac("sha256", process.env.PHONE_HASH_SALT ?? "dev-only-salt")
    .update(subject)
    .digest("hex")
    .slice(0, 32)}`;

export async function enforceLimit(name: LimitName, subject: string): Promise<void> {
  const [max, windowSeconds] = LIMITS[name];
  const { data, error } = await supabaseAdmin().rpc("hit_rate_limit", {
    p_key: keyFor(name, subject),
    p_limit: max,
    p_window_seconds: windowSeconds,
  });
  if (error) return; // A limiter outage must not take sign-in down; errors surface in monitoring.
  if (data === false) throw new ServiceError("rate_limited");
}

/** The caller's IP from the platform's forwarding headers (Vercel sets x-forwarded-for). */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null; // Outside a request (jobs, tests).
  }
}

export async function enforceIpLimit(name: LimitName): Promise<void> {
  if (devToolsEnabled()) return;
  const ip = await requestIp();
  if (ip) await enforceLimit(name, ip);
}
