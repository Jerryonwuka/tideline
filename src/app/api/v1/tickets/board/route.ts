import { NextResponse } from "next/server";
import { boardSchema } from "@/lib/schemas/tickets";
import { parseJson, route } from "@/server/http";
import { boardTicket } from "@/server/services/payments";
import { supabaseForRequest } from "@/server/supabase/server";

/** Scan or type a ticket code to board: marks the passenger on the manifest and uses the ticket. */
export const POST = route(async (request) => {
  const { code, tripId } = await parseJson(request, boardSchema);
  return NextResponse.json(await boardTicket(await supabaseForRequest(request), code, tripId));
});
