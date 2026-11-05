import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { listingInputSchema } from "@/lib/schemas/charter";
import { parseJson, route } from "@/server/http";
import { orgBasics } from "@/server/org-context";
import { listOwnListings, saveListing } from "@/server/services/charter";
import { supabaseForRequest } from "@/server/supabase/server";

/** The org's own charter listings (including drafts and the private minimum rate). */
export const GET = route(async (request) => {
  const { org_id } = z.object({ org_id: uuid }).parse(Object.fromEntries(new URL(request.url).searchParams));
  return NextResponse.json(await listOwnListings(await supabaseForRequest(request), org_id));
});

/** New listing for a charter-enabled vessel; rates in the org's currency (major units in, minor stored). */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { org_id, ...input } = await parseJson(request, z.object({ org_id: uuid }).and(listingInputSchema));
  const org = await orgBasics(db, org_id);
  return NextResponse.json({ id: await saveListing(db, org_id, org.currency, input) }, { status: 201 });
});
