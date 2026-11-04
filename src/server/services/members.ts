import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { platformConfig } from "@/config/platform";
import type { Role } from "@/lib/schemas/common";
import type { InviteInput, UpdateMembershipInput } from "@/lib/schemas/members";
import { integrations } from "@/server/integrations";
import type { Db } from "@/server/supabase/server";
import { normalisePhone } from "./auth";
import { fromDbError, ServiceError } from "./errors";

export interface Member {
  id: string;
  userId: string;
  role: Role;
  status: "active" | "suspended";
  fullName: string | null;
  phone: string | null;
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  phone: string;
  role: Role;
  expiresAt: string;
}

export async function listMembers(
  db: Db,
  orgId: string,
): Promise<{ members: Member[]; invitations: PendingInvitation[] }> {
  const [members, invitations] = await Promise.all([
    db
      .from("memberships")
      .select(
        "id, user_id, role, status, created_at, profile:profiles!memberships_user_id_profiles_id_fk(full_name, phone_e164)",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    db
      .from("invitations")
      .select("id, phone_e164, role, expires_at")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (members.error) throw fromDbError(members.error);
  if (invitations.error) throw fromDbError(invitations.error);
  return {
    members: members.data.map((m) => ({
      id: m.id,
      userId: m.user_id,
      role: m.role,
      status: m.status,
      fullName: m.profile?.full_name ?? null,
      phone: m.profile?.phone_e164 ?? null,
      joinedAt: m.created_at,
    })),
    invitations: invitations.data.map((i) => ({
      id: i.id,
      phone: i.phone_e164,
      role: i.role,
      expiresAt: i.expires_at,
    })),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

interface InviteMessage {
  /** WhatsApp template parameters, in template order. */
  templateParams: string[];
  /** SMS fallback text (already translated). */
  smsText: string;
}

/**
 * Creates an invitation (the database checks the caller may invite this role) and sends the link
 * by WhatsApp, falling back to SMS. Returns the link so the inviter can also share it themselves.
 */
export async function inviteMember(
  db: Db,
  orgId: string,
  input: InviteInput,
  ctx: { appUrl: string; locale: string; compose: (link: string) => InviteMessage },
): Promise<{ invitationId: string; link: string; delivered: boolean }> {
  const phone = normalisePhone(input.phone);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + platformConfig.invitationTtlDays * 86_400_000);

  const { data, error } = await db.rpc("create_invitation", {
    p_org: orgId,
    p_phone: phone,
    p_role: input.role,
    p_token_hash: hashToken(token),
    p_expires_at: expiresAt.toISOString(),
  });
  if (error) throw fromDbError(error);

  const link = `${ctx.appUrl.replace(/\/$/, "")}/invite/${token}`;
  const message = ctx.compose(link);
  const { messaging } = integrations();
  let delivered = false;
  const wa = await messaging
    .send({
      channel: "whatsapp",
      kind: "template",
      toE164: phone,
      template: "member_invite",
      locale: ctx.locale,
      params: message.templateParams,
    })
    .catch(() => null);
  if (wa?.status === "accepted") {
    delivered = true;
  } else {
    const sms = await messaging
      .send({ channel: "sms", kind: "text", toE164: phone, text: message.smsText })
      .catch(() => null);
    delivered = sms?.status === "accepted";
  }
  return { invitationId: data, link, delivered };
}

export async function previewInvitation(db: Db, token: string) {
  const { data, error } = await db.rpc("invitation_preview", { p_token: token });
  if (error) throw fromDbError(error);
  const row = data[0];
  return row ? { orgName: row.org_name, role: row.role, status: row.status as "valid" | "used" | "expired" } : null;
}

export async function acceptInvitation(db: Db, token: string): Promise<string> {
  const { data, error } = await db.rpc("accept_invitation", { p_token: token });
  if (error) throw fromDbError(error);
  return data;
}

export async function updateMembership(db: Db, membershipId: string, input: UpdateMembershipInput) {
  const patch: { role?: Role; status?: "active" | "suspended" } = {};
  if (input.role) patch.role = input.role;
  if (input.status) patch.status = input.status;
  const { data, error } = await db
    .from("memberships")
    .update(patch)
    .eq("id", membershipId)
    .select("id, role, status")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
  return data;
}

export async function removeMembership(db: Db, membershipId: string): Promise<void> {
  const { data, error } = await db.from("memberships").delete().eq("id", membershipId).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new ServiceError("forbidden");
}

export async function revokeInvitation(db: Db, invitationId: string): Promise<void> {
  const { data, error } = await db.from("invitations").delete().eq("id", invitationId).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new ServiceError("forbidden");
}
