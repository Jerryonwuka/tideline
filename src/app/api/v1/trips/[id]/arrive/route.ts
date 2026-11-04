import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUuid, route } from "@/server/http";
import { arrive, getTrip } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const { cash, notes } = await parseJson(
    request,
    z.object({
      cash: z
        .string()
        .regex(/^[\d,]+(\.\d{1,2})?$/)
        .optional(),
      notes: z.string().max(500).optional(),
    }),
  );
  const trip = await getTrip(db, id);
  await arrive(db, id, trip.currency, cash, notes);
  return NextResponse.json(await getTrip(db, id));
});
