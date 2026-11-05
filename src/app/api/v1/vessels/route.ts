import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { vesselInputSchema } from "@/lib/schemas/fleet";
import { parseJson, route } from "@/server/http";
import { orgIdFrom } from "@/server/http-org";
import { getOrg } from "@/server/services/orgs";
import { createVessel, listVessels } from "@/server/services/vessels";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  return NextResponse.json(await listVessels(await supabaseForRequest(request), orgIdFrom(request)));
});

export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { orgId, ...input } = await parseJson(request, z.object({ orgId: uuid }).and(vesselInputSchema));
  const org = await getOrg(db, orgId);
  return NextResponse.json(await createVessel(db, orgId, org.country_code, input), { status: 201 });
});
