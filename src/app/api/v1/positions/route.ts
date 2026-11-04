import { NextResponse } from "next/server";
import { positionsBatchSchema } from "@/lib/schemas/tracking";
import { parseJson, route } from "@/server/http";
import { savePositions } from "@/server/services/tracking";
import { supabaseForRequest } from "@/server/supabase/server";

/** A batch of GPS points from the captain's phone (in order; idempotent by client_id). */
export const POST = route(async (request) => {
  const { org_id, points } = await parseJson(request, positionsBatchSchema);
  return NextResponse.json(await savePositions(await supabaseForRequest(request), org_id, points));
});
