import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Liveness check for uptime monitors. `?deep=1` also checks the database answers (one tiny read),
 * for the scheduled uptime workflow; the plain check stays database-free.
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
  return NextResponse.json(
    { status: db === "ok" ? "ok" : "degraded", db, db_ms: Date.now() - started, ...base },
    { status: db === "ok" ? 200 : 503, headers },
  );
}
