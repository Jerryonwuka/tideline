import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getMe, type Me, type MembershipSummary } from "@/server/services/profile";
import { supabaseServer, type Db } from "@/server/supabase/server";

/** Cookie remembering which org the user is working in. */
export const ORG_COOKIE = "tl_org";

/** Only same-site relative paths are allowed as a post-login destination. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/** Where a freshly signed-in user should go next. */
export function postLoginPath(me: Me, next: string | null): string {
  if (!me.fullName) return `/onboarding/profile${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  if (next) return next;
  return me.memberships.some((m) => m.status === "active") ? "/dashboard" : "/onboarding";
}

/** The signed-in user, loaded once per request. */
export const currentUser = cache(async (): Promise<{ db: Db; me: Me | null }> => {
  const db = await supabaseServer();
  return { db, me: await getMe(db) };
});

export async function requireMe(next = "/dashboard"): Promise<{ db: Db; me: Me }> {
  const { db, me } = await currentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { db, me };
}

export function activeMembership(me: Me, preferredOrgId: string | undefined): MembershipSummary | null {
  const active = me.memberships.filter((m) => m.status === "active");
  return active.find((m) => m.orgId === preferredOrgId) ?? active[0] ?? null;
}

/** For pages inside an org: the user, their membership in the current org, or a redirect. */
export async function requireOrgContext(path: string) {
  const { db, me } = await requireMe(path);
  if (!me.fullName) redirect(`/onboarding/profile?next=${encodeURIComponent(path)}`);
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const membership = activeMembership(me, preferred);
  if (!membership) redirect("/onboarding");
  return { db, me, membership };
}

export async function setActiveOrg(orgId: string): Promise<void> {
  (await cookies()).set(ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
