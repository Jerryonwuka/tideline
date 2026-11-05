import { NextResponse } from "next/server";
import { z } from "zod";
import { devToolsEnabled } from "@/server/env";
import { isAuthorisedJob } from "@/server/jobs/auth";
import { runIdleVessels } from "@/server/services/idle";

export const dynamic = "force-dynamic";

/** Daily via pg_cron + pg_net: mark idle charter vessels and refresh price and buyer suggestions. */
export async function POST(request: Request) {
  if (!isAuthorisedJob(request))
    return NextResponse.json({ error: { code: "forbidden", message: "Forbidden" } }, { status: 403 });
  const body = devToolsEnabled()
    ? z.object({ now: z.iso.datetime().optional() }).parse(await request.json().catch(() => ({})))
    : {};
  return NextResponse.json(await runIdleVessels(body.now ? new Date(body.now) : new Date()));
}
