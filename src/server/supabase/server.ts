import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/database.types";
import { serverEnv } from "@/server/env";

export type Db = SupabaseClient<Database>;

/** The caller's IP, forwarded so database audit triggers can record it. */
function clientIp(h: Headers): string | undefined {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
}

/**
 * Supabase client acting as the signed-in user (cookie session), for server components, server
 * actions and route handlers. Row-level security applies to everything it does.
 */
export async function supabaseServer(): Promise<Db> {
  const env = serverEnv();
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const ip = clientIp(headerList);
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component: the middleware refreshes cookies instead.
        }
      },
    },
    global: { headers: ip ? { "x-client-ip": ip } : {} },
  });
}

/**
 * Client for REST callers: uses `Authorization: Bearer <jwt>` when present (mobile/offline sync),
 * otherwise falls back to the cookie session.
 */
export async function supabaseForRequest(request: Request): Promise<Db> {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const env = serverEnv();
    const ip = clientIp(request.headers);
    return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { authorization: auth, ...(ip ? { "x-client-ip": ip } : {}) } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseServer();
}
