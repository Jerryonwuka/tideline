import { NextResponse } from "next/server";
import { updateProfileSchema } from "@/lib/schemas/profile";
import { parseJson, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { getMe, updateMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  const me = await getMe(await supabaseForRequest(request));
  if (!me) throw new ServiceError("not_authenticated");
  return NextResponse.json(me);
});

export const PATCH = route(async (request) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  await updateMe(db, me.userId, await parseJson(request, updateProfileSchema));
  return NextResponse.json(await getMe(db));
});
