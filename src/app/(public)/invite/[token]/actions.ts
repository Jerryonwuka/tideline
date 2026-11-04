"use server";

import { redirect } from "next/navigation";
import { invitationTokenSchema } from "@/lib/schemas/members";
import { setActiveOrg } from "@/server/auth/session";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { acceptInvitation } from "@/server/services/members";
import { supabaseServer } from "@/server/supabase/server";

export async function acceptInvitationAction(
  _: { error?: ErrorCode },
  formData: FormData,
): Promise<{ error?: ErrorCode }> {
  const token = invitationTokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { error: "invitation_not_found" };
  let orgId: string;
  try {
    orgId = await acceptInvitation(await supabaseServer(), token.data);
  } catch (err) {
    return { error: err instanceof ServiceError ? err.code : "unknown" };
  }
  await setActiveOrg(orgId);
  redirect("/dashboard");
}
