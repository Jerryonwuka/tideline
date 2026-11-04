import "server-only";
import { cache } from "react";
import { serverEnv } from "./env";
import { supabaseAdmin } from "./supabase/admin";

// Feature flags (§14): charter mode, escrow and Phase 3, switched by platform admins in the
// console (feature_flags, audited). Escrow holds platform funds, so in production it also needs
// ESCROW_ENABLED=on (legal sign-off, §11); ESCROW_ENABLED=off forces it off anywhere.

export type FlagKey = "charter" | "escrow" | "phase3";
const DEFAULTS: Record<FlagKey, boolean> = { charter: true, escrow: true, phase3: false };

/** Per-request read of all flags (one query). */
const loadFlags = cache(async (): Promise<Record<FlagKey, boolean>> => {
  const { data, error } = await supabaseAdmin().from("feature_flags").select("key, enabled");
  if (error || !data) return DEFAULTS;
  return { ...DEFAULTS, ...Object.fromEntries(data.map((f) => [f.key, f.enabled])) };
});

/** The environment's gate for escrow (no database read). */
export function escrowAllowedByEnv(): boolean {
  const env = serverEnv();
  if (env.ESCROW_ENABLED) return env.ESCROW_ENABLED === "on";
  return env.APP_ENV !== "production";
}

export async function flagEnabled(key: FlagKey): Promise<boolean> {
  if (key === "escrow" && !escrowAllowedByEnv()) return false;
  return (await loadFlags())[key];
}

/** Escrow needs both the environment gate and the console flag. */
export async function escrowEnabled(): Promise<boolean> {
  return flagEnabled("escrow");
}
