import { NextResponse } from "next/server";
import { inviteSchema } from "@/lib/schemas/members";
import { parseJson, requireUuid, route } from "@/server/http";
import { sendInvitation } from "@/server/invites";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const result = await sendInvitation(db, id, await parseJson(request, inviteSchema));
  return NextResponse.json(
    { invitation_id: result.invitationId, link: result.link, delivered: result.delivered },
    { status: 201 },
  );
});
