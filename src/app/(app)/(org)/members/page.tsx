import { getFormatter, getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/ui/chip";
import { formatPhone } from "@/lib/phone";
import type { Role } from "@/lib/schemas/common";
import { requireOrgContext } from "@/server/auth/session";
import { listMembers } from "@/server/services/members";
import { InviteForm, PendingInvite, RemoveButton, RoleSelect } from "./members-client";

const OWNER_INVITES: Role[] = ["owner", "manager", "captain", "crew"];
const MANAGER_INVITES: Role[] = ["captain", "crew"];

export default async function MembersPage() {
  const { db, me, membership } = await requireOrgContext("/members");
  const [t, tRoles, format] = await Promise.all([getTranslations("members"), getTranslations("roles"), getFormatter()]);
  const canManage = membership.role === "owner" || membership.role === "manager";
  const isOwner = membership.role === "owner";

  if (!canManage) {
    return <p className="body-lg text-body">{t("readOnly")}</p>;
  }

  const { members, invitations } = await listMembers(db, membership.orgId);

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2 border-b border-hairline pb-8">
        <span className="label-mono-sm text-meta">{t("count", { count: members.length })}</span>
        <h1 className="display-sm text-foreground">{t("title")}</h1>
        <p className="body-lg text-body">{t("subtitle", { org: membership.orgName })}</p>
      </header>

      <section aria-labelledby="invite" className="rounded-md border border-hairline-strong panel p-6">
        <h2 id="invite" className="title-md text-foreground">
          {t("inviteTitle")}
        </h2>
        <p className="mt-1 mb-5 text-sm text-body">{t("inviteBody")}</p>
        <InviteForm orgId={membership.orgId} roles={isOwner ? OWNER_INVITES : MANAGER_INVITES} />
      </section>

      <section aria-label={t("title")}>
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline label-mono-sm text-meta">
                <th className="px-4 py-3 font-medium">{t("columns.name")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.phone")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.role")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.joined")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const self = m.userId === me.userId;
                const name = m.fullName ?? t("unnamed");
                return (
                  <tr key={m.id} className="border-b border-hairline last:border-b-0 hover:bg-surface">
                    <td className="px-4 py-3 text-foreground">
                      {name}
                      {self && <span className="ml-2 label-mono-sm text-accent">{t("you")}</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-body">{m.phone ? formatPhone(m.phone) : "—"}</td>
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <RoleSelect
                          membershipId={m.id}
                          role={m.role}
                          roles={OWNER_INVITES}
                          label={t("roleFor", { name })}
                        />
                      ) : (
                        <span className="text-body">{tRoles(m.role)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip tone={m.status === "active" ? "success" : "warning"}>
                        {t(`statuses.${m.status}`)}
                      </StatusChip>
                    </td>
                    <td className="px-4 py-3 text-body">
                      {format.dateTime(new Date(m.joinedAt), { dateStyle: "medium" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isOwner && !self && <RemoveButton membershipId={m.id} name={name} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="pending">
        <h2 id="pending" className="mb-4 label-mono-sm text-meta">
          {t("pendingTitle")}
        </h2>
        {invitations.length ? (
          <ul className="rounded-md border border-hairline">
            {invitations.map((i) => (
              <PendingInvite key={i.id} id={i.id} phone={formatPhone(i.phone)} role={i.role} expiresAt={i.expiresAt} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-meta">{t("noPending")}</p>
        )}
      </section>
    </div>
  );
}
