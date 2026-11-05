import { NextResponse } from "next/server";
import { thresholdsInputSchema } from "@/lib/schemas/safety";
import { parseJson, requireUuid, route } from "@/server/http";
import { orgBasics } from "@/server/org-context";
import { effectiveThresholds, saveThresholds } from "@/server/services/safety";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** The org's limits in force and the country defaults they may only tighten. */
export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const org = await orgBasics(db, id);
  return NextResponse.json(await effectiveThresholds(db, id, org.country_code));
});

/** 422 thresholds_too_loose for anything looser than the defaults. */
export const PUT = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  await saveThresholds(db, id, await parseJson(request, thresholdsInputSchema));
  const org = await orgBasics(db, id);
  return NextResponse.json(await effectiveThresholds(db, id, org.country_code));
});
