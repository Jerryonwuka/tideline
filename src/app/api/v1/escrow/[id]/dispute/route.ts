import { NextResponse } from "next/server";
import { disputeSchema } from "@/lib/schemas/escrow";
import { parseJson, requireUuid, route } from "@/server/http";
import { disputeEscrow } from "@/server/services/escrow";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Either side disputes: releases freeze until a Tideline admin resolves it. */
export const POST = route<Ctx>(async (request, { params }) => {
  const { reason } = await parseJson(request, disputeSchema);
  await disputeEscrow(await supabaseForRequest(request), requireUuid((await params).id), reason);
  return NextResponse.json({ ok: true });
});
