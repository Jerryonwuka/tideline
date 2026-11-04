import { NextResponse } from "next/server";
import { assertPlatformAdmin } from "@/server/admin";
import { route } from "@/server/http";
import { listRuleSets } from "@/server/services/rule-sets";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  const db = await supabaseForRequest(request);
  await assertPlatformAdmin(db);
  return NextResponse.json(await listRuleSets(db));
});
