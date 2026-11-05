import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { releaseEarly } from "@/server/services/escrow";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Charterer releases the remaining funds early. Repeating it pays nothing more. */
export const POST = route<Ctx>(async (request, { params }) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  return NextResponse.json({ payout_id: await releaseEarly(db, me, requireUuid((await params).id)) });
});
