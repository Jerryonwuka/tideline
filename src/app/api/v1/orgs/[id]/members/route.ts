import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { listMembers } from "@/server/services/members";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json(await listMembers(await supabaseForRequest(request), id));
});
