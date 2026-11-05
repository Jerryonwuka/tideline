import { NextResponse } from "next/server";
import { vesselPatchSchema } from "@/lib/schemas/fleet";
import { parseJson, requireUuid, route } from "@/server/http";
import { deleteVessel, getVessel, updateVessel } from "@/server/services/vessels";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json(await getVessel(await supabaseForRequest(request), id));
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  return NextResponse.json(await updateVessel(db, id, await parseJson(request, vesselPatchSchema)));
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  await deleteVessel(await supabaseForRequest(request), id);
  return new NextResponse(null, { status: 204 });
});
