import { NextResponse } from "next/server";
import { updateMembershipSchema } from "@/lib/schemas/members";
import { parseJson, requireUuid, route } from "@/server/http";
import { removeMembership, updateMembership } from "@/server/services/members";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  return NextResponse.json(await updateMembership(db, id, await parseJson(request, updateMembershipSchema)));
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  await removeMembership(await supabaseForRequest(request), id);
  return new NextResponse(null, { status: 204 });
});
