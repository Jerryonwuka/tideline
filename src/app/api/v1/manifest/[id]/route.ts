import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUuid, route } from "@/server/http";
import { markBoarded, removeManifestEntry } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Marks a passenger boarded (allowed after departure). */
export const PATCH = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  await parseJson(request, z.object({ boarded: z.literal(true) }));
  await markBoarded(await supabaseForRequest(request), id);
  return NextResponse.json({ id, boarded: true });
});

/** Only before departure; afterwards the manifest is locked (409). */
export const DELETE = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  await removeManifestEntry(await supabaseForRequest(request), id);
  return new NextResponse(null, { status: 204 });
});
