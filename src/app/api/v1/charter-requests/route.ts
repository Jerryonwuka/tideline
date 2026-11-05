import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { requestInputSchema } from "@/lib/schemas/charter";
import { parseJson, route } from "@/server/http";
import { createRequest, listRequests } from "@/server/services/charter";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

/** Requests the org sent (as charterer) or received (as owner), with their quotes. */
export const GET = route(async (request) => {
  const { org_id } = z.object({ org_id: uuid }).parse(Object.fromEntries(new URL(request.url).searchParams));
  return NextResponse.json(await listRequests(await supabaseForRequest(request), org_id));
});

/** A charterer's request, for a listing (sent to its owner) or open to charter owners. */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const { org_id, ...input } = await parseJson(request, z.object({ org_id: uuid }).and(requestInputSchema));
  return NextResponse.json({ id: await createRequest(db, me, org_id, input) }, { status: 201 });
});
