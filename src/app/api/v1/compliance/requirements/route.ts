import { NextResponse } from "next/server";
import { z } from "zod";
import { requirementsQuerySchema } from "@/lib/schemas/countries";
import { requirementsFor } from "@/server/compliance/rules";
import { route } from "@/server/http";
import { getVessel, vesselModes } from "@/server/services/vessels";
import { supabaseForRequest } from "@/server/supabase/server";

/** Required documents for ?vessel_id= (or a hypothetical vessel: ?country=&vessel_type=&modes=). */
export const GET = route(async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const db = await supabaseForRequest(request);
  if (params.vessel_id) {
    const vessel = await getVessel(db, z.uuid().parse(params.vessel_id));
    const requirements = await requirementsFor(db, {
      operatingCountryCode: vessel.operating_country_code,
      type: vessel.type,
      modes: vesselModes(vessel),
    });
    return NextResponse.json({ requirements });
  }
  const q = requirementsQuerySchema.parse(params);
  const requirements = await requirementsFor(db, {
    operatingCountryCode: q.country,
    type: q.vessel_type,
    modes: q.modes,
  });
  return NextResponse.json({ requirements });
});
