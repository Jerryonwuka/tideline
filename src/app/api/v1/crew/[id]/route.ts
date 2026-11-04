import { NextResponse } from "next/server";
import { crewPatchSchema } from "@/lib/schemas/fleet";
import { parseJson, requireUuid, route } from "@/server/http";
import { deleteCrewMember, getCrewMember, updateCrewMember } from "@/server/services/crew";
import { getOrg } from "@/server/services/orgs";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json(await getCrewMember(await supabaseForRequest(request), id));
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const member = await getCrewMember(db, id);
  const org = await getOrg(db, member.org_id);
  return NextResponse.json(await updateCrewMember(db, id, org.country_code, await parseJson(request, crewPatchSchema)));
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  await deleteCrewMember(await supabaseForRequest(request), id);
  return new NextResponse(null, { status: 204 });
});
