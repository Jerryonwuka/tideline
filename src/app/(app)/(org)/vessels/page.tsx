import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { ScoreBar } from "@/components/fleet/status";
import { ButtonLink } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { requireOrgContext } from "@/server/auth/session";
import { fleetCompliance } from "@/server/compliance/vessels";
import { listVessels } from "@/server/services/vessels";

export default async function VesselsPage() {
  const { db, membership } = await requireOrgContext("/vessels");
  const [t, tTypes, tStatus, vessels] = await Promise.all([
    getTranslations("fleet.vessels"),
    getTranslations("vesselTypes"),
    getTranslations("vesselStatuses"),
    listVessels(db, membership.orgId),
  ]);
  const scores = new Map((await fleetCompliance(db, membership.orgId, vessels)).map((s) => [s.vesselId, s.score]));
  const canManage = membership.role === "owner" || membership.role === "manager";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={canManage && <ButtonLink href="/vessels/new">{t("add")}</ButtonLink>}
      />
      {vessels.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline label-mono-sm text-meta">
                <th className="px-4 py-3 font-medium">{t("columns.name")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.type")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.capacity")}</th>
                <th className="w-56 px-4 py-3 font-medium">{t("columns.compliance")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {vessels.map((v) => (
                <tr key={v.id} className="border-b border-hairline last:border-b-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/vessels/${v.id}`} className="text-foreground hover:text-accent">
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-body">{tTypes(v.type)}</td>
                  <td className="px-4 py-3 text-body">
                    {v.passenger_capacity != null ? t("capacity", { count: v.passenger_capacity }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBar score={scores.get(v.id)?.score ?? 1} label={t("columns.compliance")} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip tone={v.status === "active" ? "success" : "neutral"}>{tStatus(v.status)}</StatusChip>
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
