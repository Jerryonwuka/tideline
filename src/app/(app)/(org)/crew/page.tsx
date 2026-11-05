import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { ButtonLink } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { formatPhone } from "@/lib/phone";
import { requireOrgContext } from "@/server/auth/session";
import { listCrew } from "@/server/services/crew";

export default async function CrewPage() {
  const { db, membership } = await requireOrgContext("/crew");
  const [t, tRoles, crew] = await Promise.all([
    getTranslations("fleet.crew"),
    getTranslations("crewRoles"),
    listCrew(db, membership.orgId),
  ]);
  const canManage = membership.role === "owner" || membership.role === "manager";
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={canManage && <ButtonLink href="/crew/new">{t("add")}</ButtonLink>}
      />
      {crew.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline label-mono-sm text-meta">
                <th className="px-4 py-3 font-medium">{t("columns.name")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.role")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.phone")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.vessels")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.app")}</th>
              </tr>
            </thead>
            <tbody>
              {crew.map((c) => (
                <tr key={c.id} className="border-b border-hairline last:border-b-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/crew/${c.id}`} className="text-foreground hover:text-accent">
                      {c.full_name}
                    </Link>
                    {c.status === "inactive" && <span className="ml-2 label-mono-sm text-meta">{t("inactive")}</span>}
                  </td>
                  <td className="px-4 py-3 text-body">{tRoles(c.crew_role)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-body">
                    {c.phone_e164 ? formatPhone(c.phone_e164) : "—"}
                  </td>
                  <td className="px-4 py-3 text-body">{c.vessels.map((v) => v.name).join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusChip tone={c.user_id ? "success" : "neutral"}>
                      {c.user_id ? t("hasApp") : t("noApp")}
                    </StatusChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
