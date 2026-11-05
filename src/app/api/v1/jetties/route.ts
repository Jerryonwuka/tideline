import { NextResponse } from "next/server";
import { countryCodeSchema } from "@/lib/schemas/common";
import { proposeJettySchema } from "@/lib/schemas/ferry";
import { parseJson, route } from "@/server/http";
import { listJetties, proposeJetty } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  const country = countryCodeSchema.parse(new URL(request.url).searchParams.get("country"));
  return NextResponse.json(await listJetties(await supabaseForRequest(request), country));
});

/** Orgs propose jetties; an admin verifies names and coordinates before they become active. */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { orgId, ...input } = await parseJson(request, proposeJettySchema);
  return NextResponse.json({ id: await proposeJetty(db, orgId, input) }, { status: 201 });
});
