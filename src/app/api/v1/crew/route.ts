import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { crewInputSchema } from "@/lib/schemas/fleet";
import { parseJson, route } from "@/server/http";
import { orgIdFrom } from "@/server/http-org";
import { createCrewMember, listCrew } from "@/server/services/crew";
import { getOrg } from "@/server/services/orgs";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  return NextResponse.json(await listCrew(await supabaseForRequest(request), orgIdFrom(request)));
});

export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { orgId, ...input } = await parseJson(request, z.object({ orgId: uuid }).and(crewInputSchema));
  const org = await getOrg(db, orgId);
  return NextResponse.json(await createCrewMember(db, orgId, org.country_code, input), { status: 201 });
});
