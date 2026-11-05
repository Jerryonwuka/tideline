import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import type { InviteInput } from "@/lib/schemas/members";
import { serverEnv } from "@/server/env";
import { inviteMember } from "@/server/services/members";
import { getOrg } from "@/server/services/orgs";
import { getMe } from "@/server/services/profile";
import type { Db } from "@/server/supabase/server";

/** Sends an invitation with the message written in the inviter's language. */
export async function sendInvitation(db: Db, orgId: string, input: InviteInput) {
  const [org, me, locale, t, tRoles] = await Promise.all([
    getOrg(db, orgId),
    getMe(db),
    getLocale(),
    getTranslations("members.inviteMessage"),
    getTranslations("roles"),
  ]);
  const inviter = me?.fullName ?? org.name;
  const role = tRoles(input.role);
  return inviteMember(db, orgId, input, {
    appUrl: serverEnv().NEXT_PUBLIC_APP_URL,
    locale,
    compose: (link) => ({
      templateParams: [inviter, org.name, role, link],
      smsText: t("sms", { inviter, org: org.name, role, link }),
    }),
  });
}
