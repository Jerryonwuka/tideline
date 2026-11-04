import { NextResponse } from "next/server";
import { z } from "zod";
import { now, setClockForDev } from "@/server/clock";
import { devToolsEnabled } from "@/server/env";

export const dynamic = "force-dynamic";

/** Local-only: pin the server clock for e2e tests ({at: ISO} or {at: null} to reset). 404 elsewhere. */
export async function POST(request: Request) {
  if (!devToolsEnabled()) return new NextResponse(null, { status: 404 });
  const { at } = z.object({ at: z.iso.datetime({ offset: true }).nullable() }).parse(await request.json());
  setClockForDev(at ? new Date(at) : null);
  return NextResponse.json({ now: now().toISOString() });
}
