import { NextResponse } from "next/server";
import { updateOrgSchema } from "@/lib/schemas/orgs";
import { parseJson, requireUuid, route } from "@/server/http";
import { getOrg, updateOrg } from "@/server/services/orgs";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json(await getOrg(await supabaseForRequest(request), id));
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  return NextResponse.json(await updateOrg(db, id, await parseJson(request, updateOrgSchema)));
});
