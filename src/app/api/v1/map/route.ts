import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { route } from "@/server/http";
import { liveFleet } from "@/server/services/tracking";
import { supabaseForRequest } from "@/server/supabase/server";

/** The live map's data: vessels, their current trip and last known position (last 24 h). */
export const GET = route(async (request) => {
  const { org_id } = z.object({ org_id: uuid }).parse(Object.fromEntries(new URL(request.url).searchParams));
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  return NextResponse.json(await liveFleet(await supabaseForRequest(request), org_id, since), {
    headers: { "cache-control": "no-store" },
  });
});
