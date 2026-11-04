import { NextResponse } from "next/server";
import { z } from "zod";
import { devToolsEnabled } from "@/server/env";
import { isAuthorisedJob } from "@/server/jobs/auth";
import { reconcilePayments } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/** Daily via pg_cron + pg_net: confirm stuck payments, release seat holds, lapse subscriptions. */
export async function POST(request: Request) {
  if (!isAuthorisedJob(request))
    return NextResponse.json({ error: { code: "forbidden", message: "Forbidden" } }, { status: 403 });
  const body = devToolsEnabled()
    ? z.object({ now: z.iso.datetime().optional() }).parse(await request.json().catch(() => ({})))
    : {};
  return NextResponse.json(await reconcilePayments(body.now ? new Date(body.now) : new Date()));
}
