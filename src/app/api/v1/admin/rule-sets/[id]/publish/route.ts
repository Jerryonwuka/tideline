import { NextResponse } from "next/server";
import { publishRuleSetSchema } from "@/lib/schemas/countries";
import { assertPlatformAdmin } from "@/server/admin";
import { parseJson, requireUuid, route } from "@/server/http";
import { getRuleSet, publishRuleSet } from "@/server/services/rule-sets";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  await assertPlatformAdmin(db);
  const { note } = await parseJson(request, publishRuleSetSchema);
  await publishRuleSet(db, id, note);
  return NextResponse.json(await getRuleSet(db, id));
});
