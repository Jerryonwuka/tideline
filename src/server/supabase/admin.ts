import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { serverEnv } from "@/server/env";

/**
 * Service-role client: bypasses RLS. Server-only, for writes no user may make directly (AI job
 * records, scheduled jobs). Never import from client code (CLAUDE.md rule 1).
 */
export function supabaseAdmin() {
  const env = serverEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminDb = ReturnType<typeof supabaseAdmin>;
