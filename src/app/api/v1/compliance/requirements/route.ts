import { NextResponse } from "next/server";
import { requirementsQuerySchema } from "@/lib/schemas/countries";
import { requirementsFor } from "@/server/compliance/rules";
import { route } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase/server";

/** Required documents for a vessel profile. Takes ?vessel_id= once vessels exist (M2). */
export const GET = route(async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const q = requirementsQuerySchema.parse(params);
  const requirements = await requirementsFor(await supabaseForRequest(request), {
    operatingCountryCode: q.country,
    type: q.vessel_type,
    modes: q.modes,
  });
  return NextResponse.json({ requirements });
});
