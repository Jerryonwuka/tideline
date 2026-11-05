import { NextResponse } from "next/server";
import { z } from "zod";
import { devToolsEnabled } from "@/server/env";
import { runIdleVessels } from "@/server/services/idle";

export const dynamic = "force-dynamic";

/** Local-only: run the idle-vessels job at a given time (e2e). 404 elsewhere. */
export async function POST(request: Request) {
  if (!devToolsEnabled()) return new NextResponse(null, { status: 404 });
  const { now, orgId } = z
    .object({ now: z.iso.datetime({ offset: true }), orgId: z.uuid().optional() })
    .parse(await request.json());
  return NextResponse.json(await runIdleVessels(new Date(now), orgId ? { orgId } : undefined));
}
