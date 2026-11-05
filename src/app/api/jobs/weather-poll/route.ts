import { NextResponse } from "next/server";
import { now } from "@/server/clock";
import { integrations } from "@/server/integrations";
import { isAuthorisedJob } from "@/server/jobs/auth";
import { pollWeather } from "@/server/services/weather";
import { supabaseAdmin } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

/** Every 30 minutes via pg_cron + pg_net: forecasts for jetties on active routes. */
export async function POST(request: Request) {
  if (!isAuthorisedJob(request))
    return NextResponse.json({ error: { code: "forbidden", message: "Forbidden" } }, { status: 403 });
  return NextResponse.json(await pollWeather(supabaseAdmin(), integrations().weather, now()));
}
