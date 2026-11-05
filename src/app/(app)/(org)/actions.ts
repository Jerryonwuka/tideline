"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatPhone } from "@/lib/phone";
import { inviteSchema, updateMembershipSchema } from "@/lib/schemas/members";
import { activeMembership, setActiveOrg } from "@/server/auth/session";
import { sendInvitation } from "@/server/invites";
import { normalisePhone } from "@/server/services/auth";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { removeMembership, revokeInvitation, updateMembership } from "@/server/services/members";
import { getMe } from "@/server/services/profile";
import { supabaseServer } from "@/server/supabase/server";

export type MembersState = {
  error?: ErrorCode;
  ok?: boolean;
  invitedPhone?: string;
  link?: string;
  delivered?: boolean;
};

const code = (err: unknown): ErrorCode => (err instanceof ServiceError ? err.code : "unknown");

export async function switchOrgAction(formData: FormData): Promise<void> {
  const orgId = z.uuid().safeParse(formData.get("orgId"));
  const db = await supabaseServer();
  const me = await getMe(db);
  if (!me) redirect("/login");
  // Only switch to an org the user actually belongs to.
  if (orgId.success && activeMembership(me, orgId.data)?.orgId === orgId.data) await setActiveOrg(orgId.data);
  redirect("/dashboard");
}

export async function inviteAction(_: MembersState, formData: FormData): Promise<MembersState> {
  const orgId = z.uuid().safeParse(formData.get("orgId"));
  const parsed = inviteSchema.safeParse({ phone: formData.get("phone"), role: formData.get("role") });
  if (!orgId.success) return { error: "validation" };
  if (!parsed.success)
    return { error: parsed.error.issues.some((i) => i.path[0] === "phone") ? "invalid_phone" : "validation" };
  try {
    const result = await sendInvitation(await supabaseServer(), orgId.data, parsed.data);
    revalidatePath("/members");
    return {
      ok: true,
      invitedPhone: formatPhone(normalisePhone(parsed.data.phone)),
      link: result.link,
      delivered: result.delivered,
    };
  } catch (err) {
    return { error: code(err) };
  }
}

export async function changeMembershipAction(_: MembersState, formData: FormData): Promise<MembersState> {
  const id = z.uuid().safeParse(formData.get("membershipId"));
  const parsed = updateMembershipSchema.safeParse({
    role: formData.get("role") ?? undefined,
    status: formData.get("status") ?? undefined,
  });
  if (!id.success || !parsed.success) return { error: "validation" };
  try {
    await updateMembership(await supabaseServer(), id.data, parsed.data);
    revalidatePath("/members");
    return { ok: true };
  } catch (err) {
    return { error: code(err) };
  }
}

export async function removeMembershipAction(_: MembersState, formData: FormData): Promise<MembersState> {
  const id = z.uuid().safeParse(formData.get("membershipId"));
  if (!id.success) return { error: "validation" };
  try {
    await removeMembership(await supabaseServer(), id.data);
    revalidatePath("/members");
    return { ok: true };
  } catch (err) {
    return { error: code(err) };
  }
}

export async function revokeInvitationAction(_: MembersState, formData: FormData): Promise<MembersState> {
  const id = z.uuid().safeParse(formData.get("invitationId"));
  if (!id.success) return { error: "validation" };
  try {
    await revokeInvitation(await supabaseServer(), id.data);
    revalidatePath("/members");
    return { ok: true };
  } catch (err) {
    return { error: code(err) };
  }
}
