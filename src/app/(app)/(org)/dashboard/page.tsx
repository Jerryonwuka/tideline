import { FileText, Ship, Users } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BracketIcon } from "@/components/marketing/brackets";
import { StatusChip } from "@/components/ui/chip";
import { requireOrgContext } from "@/server/auth/session";
import { getOrg } from "@/server/services/orgs";

export default async function DashboardPage() {
  const { db, me, membership } = await requireOrgContext("/dashboard");
  const [t, tRoles, org] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("roles"),
    getOrg(db, membership.orgId),
  ]);
  const canInvite = membership.role === "owner" || membership.role === "manager";
  const tone =
    org.verification_status === "verified" ? "success" : org.verification_status === "pending" ? "info" : "neutral";

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3 border-b border-hairline pb-8">
        <StatusChip tone={tone} className="w-fit">
          {t(`verification.${org.verification_status}`)}
        </StatusChip>
        <h1 className="display-sm text-foreground">{t("title", { name: me.fullName ?? "" })}</h1>
        <p className="body-lg text-body">{t("subtitle", { org: org.name, role: tRoles(membership.role) })}</p>
      </header>

      <section aria-labelledby="next-steps">
        <h2 id="next-steps" className="mb-4 label-mono-sm text-meta">
          {t("nextTitle")}
        </h2>
        <div className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline md:grid-cols-3">
          <div className="flex flex-col panel p-6">
            <BracketIcon>
              <Users />
            </BracketIcon>
            <h3 className="mt-6 title-md text-foreground">{t("steps.team.title")}</h3>
            <p className="mt-2 flex-1 text-sm text-body">{t("steps.team.body")}</p>
            {canInvite && (
              <Link href="/members" className="mt-6 label-mono-sm text-accent hover:underline">
                {t("steps.team.action")} →
              </Link>
            )}
          </div>
          {(["vessels", "documents"] as const).map((key) => (
            <div key={key} className="flex flex-col panel p-6 opacity-70">
              <BracketIcon>{key === "vessels" ? <Ship /> : <FileText />}</BracketIcon>
              <h3 className="mt-6 title-md text-foreground">{t(`steps.${key}.title`)}</h3>
              <p className="mt-2 flex-1 text-sm text-body">{t(`steps.${key}.body`)}</p>
              <span className="mt-6 label-mono-sm text-meta">{t("soon")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
