import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUuid, route } from "@/server/http";
import { cancelTrip, getTrip } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const { notes } = await parseJson(request, z.object({ notes: z.string().max(500).optional() }));
  await cancelTrip(db, id, notes);
  return NextResponse.json(await getTrip(db, id));
});
