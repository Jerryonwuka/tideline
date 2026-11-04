import { NextResponse } from "next/server";
import { assignCrewSchema } from "@/lib/schemas/fleet";
import { parseJson, requireUuid, route } from "@/server/http";
import { assignCrew, getVessel, vesselCrew } from "@/server/services/vessels";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json(await vesselCrew(await supabaseForRequest(request), id));
});

export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const vessel = await getVessel(db, id);
  const { crewMemberId, fromDate } = await parseJson(request, assignCrewSchema);
  return NextResponse.json({ id: await assignCrew(db, vessel.org_id, id, crewMemberId, fromDate) }, { status: 201 });
});
