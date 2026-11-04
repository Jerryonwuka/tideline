import { NextResponse } from "next/server";
import { createOrgSchema } from "@/lib/schemas/orgs";
import { parseJson, route } from "@/server/http";
import { createOrg, getOrg } from "@/server/services/orgs";
import { supabaseForRequest } from "@/server/supabase/server";

export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const id = await createOrg(db, await parseJson(request, createOrgSchema));
  return NextResponse.json(await getOrg(db, id), { status: 201 });
});
