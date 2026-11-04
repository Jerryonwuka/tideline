import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import { myRequests, requestData } from "@/server/services/privacy";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  return NextResponse.json(await myRequests(db, me.userId));
});

/** Export or delete request for the signed-in person (§12 rights). */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const { kind } = await parseJson(request, z.object({ kind: z.enum(["export", "delete"]) }));
  return NextResponse.json({ id: await requestData(db, me, kind) }, { status: 201 });
});
