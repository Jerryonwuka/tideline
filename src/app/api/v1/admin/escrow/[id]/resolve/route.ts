import { NextResponse } from "next/server";
import { resolveSchema } from "@/lib/schemas/escrow";
import { parseJson, requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { resolveDispute } from "@/server/services/escrow";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Platform admin resolves a dispute: release, refund, or split (owner's share in minor units). */
export const POST = route<Ctx>(async (request, { params }) => {
  const me = await getMe(await supabaseForRequest(request));
  if (!me) throw new ServiceError("not_authenticated");
  const { action, owner_share_minor } = await parseJson(request, resolveSchema);
  const r = await resolveDispute(me, requireUuid((await params).id), action, owner_share_minor);
  return NextResponse.json({ to_owner_minor: String(r.toOwner), to_charterer_minor: String(r.toCharterer) });
});
