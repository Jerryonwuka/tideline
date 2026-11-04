import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { confirmHire } from "@/server/services/escrow";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Each side confirms on-hire; when both have, the matching escrow tranche is released. */
export const POST = route<Ctx>(async (request, { params }) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  return NextResponse.json(await confirmHire(db, me, requireUuid((await params).id), "on"));
});
