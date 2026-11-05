import { NextResponse } from "next/server";
import { z } from "zod";
import { devToolsEnabled, serverEnv } from "@/server/env";
import { integrations } from "@/server/integrations";
import { isAuthorisedJob } from "@/server/jobs/auth";
import { runExpiryAlerts } from "@/server/jobs/expiry-alerts";
import { supabaseAdmin } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

// Locally (fake integrations only) a test can pin the clock or the orgs; never in staging/production.
const devOptions = z.object({
  now: z.iso.datetime().optional(),
  org_ids: z.array(z.uuid()).optional(),
  ignore_hour: z.boolean().optional(),
});

/** Hourly (UTC) via pg_cron + pg_net; sends to orgs whose local time is 07:00. */
export async function POST(request: Request) {
  if (!isAuthorisedJob(request))
    return NextResponse.json({ error: { code: "forbidden", message: "Forbidden" } }, { status: 403 });
  const body = devToolsEnabled() ? devOptions.parse(await request.json().catch(() => ({}))) : {};
  const summary = await runExpiryAlerts(
    {
      db: supabaseAdmin(),
      messaging: integrations().messaging,
      appUrl: serverEnv().NEXT_PUBLIC_APP_URL,
      now: body.now ? new Date(body.now) : new Date(),
    },
    { orgIds: body.org_ids, ignoreHour: body.ignore_hour },
  );
  return NextResponse.json(summary);
}
