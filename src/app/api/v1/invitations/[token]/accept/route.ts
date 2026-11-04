import { NextResponse } from "next/server";
import { invitationTokenSchema } from "@/lib/schemas/members";
import { route } from "@/server/http";
import { acceptInvitation } from "@/server/services/members";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ token: string }> };

export const POST = route<Ctx>(async (request, { params }) => {
  const token = invitationTokenSchema.parse((await params).token);
  const orgId = await acceptInvitation(await supabaseForRequest(request), token);
  return NextResponse.json({ org_id: orgId });
});
