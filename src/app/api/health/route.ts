import { NextResponse } from "next/server";
import { serverEnv } from "@/server/env";
import { missingLiveConfig } from "@/server/integrations";
import { supabaseAdmin } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Liveness check for uptime monitors. `?deep=1` also checks the database answers (one tiny read),
 * for the scheduled uptime workflow, and that live integrations have their settings (names only,
 * never values); the plain check stays database-free.
 */
export async function GET(request: Request) {
  const base = { time: new Date().toISOString(), version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" };
  const headers = { "cache-control": "no-store" };
  if (new URL(request.url).searchParams.get("deep") !== "1") {
    return NextResponse.json({ status: "ok", ...base }, { headers });
  }
  const started = Date.now();
  const { error } = await supabaseAdmin().from("feature_flags").select("key").limit(1);
  const db = error ? "down" : "ok";
  const env = serverEnv();
  const missing = env.INTEGRATIONS_MODE === "live" ? missingLiveConfig(env) : [];
  const whatsapp = env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? "on" : "sms_only";
  const healthy = db === "ok" && missing.length === 0;
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      db,
      db_ms: Date.now() - started,
      integrations: env.INTEGRATIONS_MODE,
      payments: env.PAYMENTS_MODE,
      whatsapp,
      missing_config: missing,
      ...base,
    },
    { status: healthy ? 200 : 503, headers },
  );
}
