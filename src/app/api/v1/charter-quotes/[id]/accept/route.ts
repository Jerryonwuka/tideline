import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { decideQuote } from "@/server/services/charter";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Charterer side: accept a quote. Creates the charter (pending contract); other quotes are declined. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json({ charter_id: await decideQuote(await supabaseForRequest(request), id, "accept") });
});
