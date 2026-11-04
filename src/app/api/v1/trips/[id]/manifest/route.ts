import { NextResponse } from "next/server";
import { manifestEntrySchema } from "@/lib/schemas/ferry";
import { parseJson, requireUuid, route } from "@/server/http";
import { orgBasics } from "@/server/org-context";
import { addManifestEntry, getTrip, listManifest } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json(await listManifest(await supabaseForRequest(request), id));
});

/** 409 capacity_exceeded is a hard block. After departure, additions are stored as amendments. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const trip = await getTrip(db, id);
  const org = await orgBasics(db, trip.org_id);
  const entryId = await addManifestEntry(
    db,
    trip.org_id,
    id,
    org.country_code,
    await parseJson(request, manifestEntrySchema),
  );
  return NextResponse.json({ id: entryId }, { status: 201 });
});
