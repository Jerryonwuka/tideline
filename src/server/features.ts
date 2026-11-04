import "server-only";
import { serverEnv } from "./env";

// Feature flags (§14). Escrow holds platform funds and stays off in production until the legal
// structure is confirmed (§11): ESCROW_ENABLED=on turns it on explicitly.

export function escrowEnabled(): boolean {
  const env = serverEnv();
  if (env.ESCROW_ENABLED) return env.ESCROW_ENABLED === "on";
  return env.APP_ENV !== "production";
}
