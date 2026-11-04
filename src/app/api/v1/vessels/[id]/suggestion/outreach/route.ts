import { NextResponse } from "next/server";
import { outreachSchema } from "@/lib/schemas/idle";
import { parseJson, requireUuid, route } from "@/server/http";
import { draftOutreach } from "@/server/services/idle";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Drafts an outreach message to a suggested charterer for the owner to send (nothing is sent). */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const { buyerOrgId } = await parseJson(request, outreachSchema);
  return NextResponse.json({ text: await draftOutreach(await supabaseForRequest(request), id, buyerOrgId) });
});
