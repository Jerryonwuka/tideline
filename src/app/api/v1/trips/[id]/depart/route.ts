import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { depart, getTrip } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** 409 without life jackets, from the wrong status, or without a valid safety check (safety_check_required, safety_unacknowledged, safety_blocked). */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  await depart(db, id);
  return NextResponse.json(await getTrip(db, id));
});
