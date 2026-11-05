import { NextResponse } from "next/server";
import { overrideDecisionSchema } from "@/lib/schemas/safety";
import { parseJson, requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import { decideOverride } from "@/server/services/safety";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Owner (or an allowed manager) approves or declines, with a reason. Recorded once, never edited. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const { decision, reason } = await parseJson(request, overrideDecisionSchema);
  return NextResponse.json({ id: await decideOverride(db, me, id, decision, reason) }, { status: 201 });
});
