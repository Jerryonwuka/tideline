import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { exportLink } from "@/server/services/privacy";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** The person's own export: a 5-minute signed link (RLS: only their request). */
export const GET = route<Ctx>(async (request, { params }) => {
  const url = await exportLink(await supabaseForRequest(request), requireUuid((await params).id));
  return NextResponse.redirect(url, { headers: { "cache-control": "no-store" } });
});
