import "server-only";
import type { TablesUpdate } from "@/lib/database.types";
import type { Role } from "@/lib/schemas/common";
import type { UpdateProfileInput } from "@/lib/schemas/profile";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

export interface MembershipSummary {
  id: string;
  orgId: string;
  orgName: string;
  role: Role;
  status: "active" | "suspended";
}

export interface Me {
  userId: string;
  phone: string | null;
  fullName: string | null;
  locale: string | null;
  timeZone: string | null;
  isPlatformAdmin: boolean;
  memberships: MembershipSummary[];
}

/** The signed-in user with their profile and org memberships, or null when signed out. */
export async function getMe(db: Db): Promise<Me | null> {
  const { data: auth } = await db.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const [profile, memberships, admin] = await Promise.all([
    db.from("profiles").select("full_name, phone_e164, locale, time_zone").eq("id", user.id).maybeSingle(),
    db
      .from("memberships")
      .select("id, org_id, role, status, orgs(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profile.error) throw fromDbError(profile.error);
  if (memberships.error) throw fromDbError(memberships.error);

  return {
    userId: user.id,
    phone: profile.data?.phone_e164 ?? null,
    fullName: profile.data?.full_name ?? null,
    locale: profile.data?.locale ?? null,
    timeZone: profile.data?.time_zone ?? null,
    isPlatformAdmin: !!admin.data,
    memberships: (memberships.data ?? []).map((m) => ({
      id: m.id,
      orgId: m.org_id,
      orgName: m.orgs?.name ?? "",
      role: m.role,
      status: m.status,
    })),
  };
}

export async function updateMe(db: Db, userId: string, input: UpdateProfileInput): Promise<void> {
  const patch: TablesUpdate<"profiles"> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.locale !== undefined) patch.locale = input.locale;
  if (input.timeZone !== undefined) patch.time_zone = input.timeZone;
  if (input.whatsappOptIn !== undefined) patch.whatsapp_opt_in = input.whatsappOptIn;
  if (Object.keys(patch).length === 0) return;
  const { error, count } = await db.from("profiles").update(patch, { count: "exact" }).eq("id", userId);
  if (error) throw fromDbError(error);
  if (!count) throw new ServiceError("not_found");
}
