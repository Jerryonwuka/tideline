import { NextResponse } from "next/server";
import { assertPlatformAdmin } from "@/server/admin";
import { requireUuid, route } from "@/server/http";
import { getRuleSet, newRuleSetVersion } from "@/server/services/rule-sets";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Starts the next version of a rule set as an editable draft copy. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  await assertPlatformAdmin(db);
  return NextResponse.json(await getRuleSet(db, await newRuleSetVersion(db, id)), { status: 201 });
});
