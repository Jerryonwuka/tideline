import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { decideQuote } from "@/server/services/charter";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Charterer side: decline a quote. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  await decideQuote(await supabaseForRequest(request), id, "decline");
  return NextResponse.json({ ok: true });
});
