import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { DocumentStatusChip } from "@/components/fleet/status";
import { ButtonLink } from "@/components/ui/button";
import { formatPhone } from "@/lib/phone";
import { requireOrgContext } from "@/server/auth/session";
import { getCrewMember, listCrew } from "@/server/services/crew";
import { listDocuments } from "@/server/services/documents";
import { ServiceError } from "@/server/services/errors";

export default async function CrewMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, membership } = await requireOrgContext(`/crew/${id}`);
  const member = await getCrewMember(db, id).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const [t, tAll, docs, crew] = await Promise.all([
    getTranslations("fleet.crewMember"),
    getTranslations(),
    listDocuments(db, { orgId: membership.orgId, subjectType: "crew", subjectId: id }),
    listCrew(db, membership.orgId),
  ]);
  const vessels = crew.find((c) => c.id === id)?.vessels ?? [];
  const canManage = membership.role === "owner" || membership.role === "manager";
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title={member.full_name}
        subtitle={`${tAll(`crewRoles.${member.crew_role}`)}${member.phone_e164 ? ` · ${formatPhone(member.phone_e164)}` : ""}`}
        actions={
          canManage && (
            <ButtonLink href={`/documents/new?subject=crew:${id}&next=${encodeURIComponent(`/crew/${id}`)}`}>
              {tAll("fleet.vessel.upload")}
            </ButtonLink>
          )
        }
      />
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-md border border-hairline p-4">
          <h2 className="label-mono-sm text-meta">{t("vessels")}</h2>
          <ul className="mt-3 text-sm">
            {vessels.length ? (
              vessels.map((v) => (
                <li key={v.id}>
                  <Link href={`/vessels/${v.id}`} className="text-foreground hover:text-accent">
                    {v.name}
                  </Link>
                </li>
              ))
            ) : (
              <li className="text-meta">{t("none")}</li>
            )}
          </ul>
        </div>
        <div className="rounded-md border border-hairline p-4">
          <h2 className="label-mono-sm text-meta">{t("contact")}</h2>
          <p className="mt-3 text-sm text-foreground">
            {member.emergency_contact_name ?? t("none")}
            {member.emergency_contact_phone && (
              <span className="ml-2 font-mono text-xs text-body">{formatPhone(member.emergency_contact_phone)}</span>
            )}
          </p>
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="title-lg text-foreground">{t("certificates")}</h2>
        <ul className="rounded-md border border-hairline">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
            >
              <Link href={`/documents/${d.id}`} className="text-sm text-foreground hover:text-accent">
                {tAll(`documentTypes.${d.document_type_code}`)}
              </Link>
              {d.effective_status && <DocumentStatusChip status={d.effective_status} />}
            </li>
          ))}
          {!docs.length && <li className="px-4 py-3 text-sm text-meta">{t("none")}</li>}
        </ul>
      </section>
    </div>
  );
}
