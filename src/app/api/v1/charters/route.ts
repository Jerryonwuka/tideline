import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { offPlatformCharterSchema } from "@/lib/schemas/invoices";
import { parseJson, route } from "@/server/http";
import { orgBasics } from "@/server/org-context";
import { listCharters, recordOffPlatformCharter } from "@/server/services/contracts";
import { supabaseForRequest } from "@/server/supabase/server";

/** Charters the org owns or chartered. */
export const GET = route(async (request) => {
  const { org_id } = z.object({ org_id: uuid }).parse(Object.fromEntries(new URL(request.url).searchParams));
  return NextResponse.json(await listCharters(await supabaseForRequest(request), org_id));
});

/** Record a charter agreed off the platform, for invoicing only (no commission). */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { org_id, ...input } = await parseJson(request, z.object({ org_id: uuid }).and(offPlatformCharterSchema));
  const org = await orgBasics(db, org_id);
  return NextResponse.json({ id: await recordOffPlatformCharter(db, org_id, org.currency, input) }, { status: 201 });
});
