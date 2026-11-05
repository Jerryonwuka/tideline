import { NextResponse } from "next/server";
import { pendingQuerySchema } from "@/lib/schemas/safety";
import { route } from "@/server/http";
import { pendingOverrides } from "@/server/services/safety";
import { supabaseForRequest } from "@/server/supabase/server";

/** Override requests waiting for a decision. */
export const GET = route(async (request) => {
  const { org_id } = pendingQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return NextResponse.json(await pendingOverrides(await supabaseForRequest(request), org_id));
});
