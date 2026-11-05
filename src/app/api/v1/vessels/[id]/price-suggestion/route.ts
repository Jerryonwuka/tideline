import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { suggestionFor } from "@/server/services/idle";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** The latest price suggestion for an idle vessel, with the inputs it was computed from. */
export const GET = route<Ctx>(async (request, { params }) => {
  const s = await suggestionFor(await supabaseForRequest(request), requireUuid((await params).id));
  if (!s) throw new ServiceError("not_found");
  return NextResponse.json({
    vessel_id: s.vessel_id,
    idle_since: s.idle_since,
    currency: s.currency,
    suggested_rate_minor: s.suggested_rate_minor,
    inputs: s.inputs,
    rationale: s.rationale,
    listing_description: s.listing_description,
    review_status: s.review_status,
  });
});
