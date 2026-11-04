import { NextResponse } from "next/server";
import { assertPlatformAdmin } from "@/server/admin";
import { requireUuid, route } from "@/server/http";
import { getRuleSet } from "@/server/services/rule-sets";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  await assertPlatformAdmin(db);
  return NextResponse.json(await getRuleSet(db, id));
});
