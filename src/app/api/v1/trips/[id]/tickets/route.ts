import { NextResponse } from "next/server";
import { agentSaleSchema } from "@/lib/schemas/tickets";
import { parseJson, requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { recordAgentSale } from "@/server/services/payments";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Agent sale at the jetty: cash or bank transfer recorded; the passenger goes on the manifest. */
export const POST = route<Ctx>(async (request, { params }) => {
  const tripId = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const input = await parseJson(request, agentSaleSchema);
  return NextResponse.json({ code: await recordAgentSale(db, me, { ...input, tripId }) }, { status: 201 });
});
