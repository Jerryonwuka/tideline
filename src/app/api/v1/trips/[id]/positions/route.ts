import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { tripTrack } from "@/server/services/tracking";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** The trip's track, oldest first (for replay). */
export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json(await tripTrack(await supabaseForRequest(request), id));
});
