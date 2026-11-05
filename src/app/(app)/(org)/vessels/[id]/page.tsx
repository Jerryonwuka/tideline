import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AssignCrewForm } from "@/components/fleet/assign-crew";
import { PageHeader } from "@/components/fleet/page-header";
import { DocumentStatusChip, ScoreBar } from "@/components/fleet/status";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { requireOrgContext } from "@/server/auth/session";
import { fleetCompliance } from "@/server/compliance/vessels";
import { listCrew } from "@/server/services/crew";
import { listDocuments } from "@/server/services/documents";
import { ServiceError } from "@/server/services/errors";
import { getVessel, vesselCrew, vesselModes } from "@/server/services/vessels";
import { deleteVesselAction, endAssignmentAction } from "../../fleet-actions";

export default async function VesselPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, membership } = await requireOrgContext(`/vessels/${id}`);
  const vessel = await getVessel(db, id).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const canManage = membership.role === "owner" || membership.role === "manager";
  const [t, tAll, format, [compliance], docs, crew, allCrew] = await Promise.all([
    getTranslations("fleet.vessel"),
    getTranslations(),
    getFormatter(),
    fleetCompliance(db, membership.orgId, [vessel]),
    listDocuments(db, { orgId: membership.orgId, subjectType: "vessel", subjectId: id }),
    vesselCrew(db, id),
    canManage ? listCrew(db, membership.orgId) : Promise.resolve([]),
  ]);
  const byType = new Map(docs.map((d) => [d.document_type_code, d]));
  const requiredCodes = new Set(compliance!.requirements.map((r) => r.documentTypeCode));
  const otherDocs = docs.filter((d) => !requiredCodes.has(d.document_type_code ?? ""));
  const assigned = new Set(crew.map((c) => c.crew?.id));
  const addHref = (type?: string) =>
    `/documents/new?subject=vessel:${id}${type ? `&type=${type}` : ""}&next=${encodeURIComponent(`/vessels/${id}`)}`;
  const facts: [string, string | number | null][] = [
    [t("fields.type"), tAll(`vesselTypes.${vessel.type}`)],
    [t("fields.registration"), vessel.registration_no],
    [t("fields.imo"), vessel.imo],
    [t("fields.passengers"), vessel.passenger_capacity],
    [t("fields.length"), vessel.length_m ? `${vessel.length_m} m` : null],
    [t("fields.year"), vessel.year_built],
    [t("fields.engine"), vessel.engine],
    [
      t("fields.modes"),
      vesselModes(vessel)
        .map((m) => tAll(`modeNames.${m}`))
        .join(", ") || null,
    ],
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title={vessel.name}
        eyebrow={
          <StatusChip tone={vessel.status === "active" ? "success" : "neutral"} className="w-fit">
            {tAll(`vesselStatuses.${vessel.status}`)}
          </StatusChip>
        }
        actions={canManage && <ButtonLink href={addHref()}>{t("upload")}</ButtonLink>}
      />

      <dl className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="label-mono-sm text-meta">{label}</dt>
            <dd className="mt-1 text-sm text-foreground">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="compliance" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="compliance" className="title-lg text-foreground">
            {t("compliance")}
          </h2>
          <span className="text-sm text-body">
            {t("scoreLabel", { valid: compliance!.score.valid, required: compliance!.score.required })}
          </span>
        </div>
        <ScoreBar score={compliance!.score.score} label={t("compliance")} />
        {compliance!.requirements.length === 0 ? (
          <p className="text-sm text-meta">{t("noRequirements")}</p>
        ) : (
          <ul className="rounded-md border border-hairline">
            {compliance!.requirements.map((r) => {
              const doc = byType.get(r.documentTypeCode);
              return (
                <li
                  key={r.documentTypeCode}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
                >
                  <span className="flex flex-col">
                    <span className="text-sm text-foreground">
                      {doc ? (
                        <Link href={`/documents/${doc.id}`} className="hover:text-accent">
                          {tAll(r.nameKey)}
                        </Link>
                      ) : (
                        tAll(r.nameKey)
                      )}
                    </span>
                    <span className="text-xs text-meta">
                      {r.mandatory ? t("required") : t("optional")}
                      {r.regulator && ` · ${t("regulator", { regulator: r.regulator })}`}
                      {doc?.expiry_date &&
                        ` · ${format.dateTime(new Date(`${doc.expiry_date}T00:00:00`), { dateStyle: "medium" })}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {doc?.effective_status ? (
                      <DocumentStatusChip status={doc.effective_status} />
                    ) : (
                      <StatusChip tone="danger">{t("missing")}</StatusChip>
                    )}
                    {canManage && (
                      <Link href={addHref(r.documentTypeCode)} className="label-mono-sm text-accent hover:underline">
                        {doc ? t("replace") : t("upload")}
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {otherDocs.length > 0 && (
        <section aria-labelledby="other-docs" className="flex flex-col gap-4">
          <h2 id="other-docs" className="title-lg text-foreground">
            {t("otherDocuments")}
          </h2>
          <ul className="rounded-md border border-hairline">
            {otherDocs.map((d) => (
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
          </ul>
        </section>
      )}

      <section aria-labelledby="vessel-crew" className="flex flex-col gap-4">
        <h2 id="vessel-crew" className="title-lg text-foreground">
          {t("crew")}
        </h2>
        {crew.length === 0 ? (
          <p className="text-sm text-meta">{t("noCrew")}</p>
        ) : (
          <ul className="rounded-md border border-hairline">
            {crew.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
              >
                <span className="text-sm">
                  <span className="text-foreground">{a.crew?.full_name}</span>
                  <span className="ml-2 text-meta">{a.crew && tAll(`crewRoles.${a.crew.crew_role}`)}</span>
                </span>
                {canManage && (
                  <form action={endAssignmentAction}>
                    <input type="hidden" name="assignmentId" value={a.id} />
                    <input type="hidden" name="vesselId" value={id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {t("end")}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <AssignCrewForm
            vesselId={id}
            options={allCrew
              .filter((c) => !assigned.has(c.id) && c.status === "active")
              .map((c) => ({ id: c.id, label: `${c.full_name} · ${tAll(`crewRoles.${c.crew_role}`)}` }))}
          />
        )}
      </section>

      {membership.role === "owner" && (
        <form action={deleteVesselAction} className="border-t border-hairline pt-6">
          <input type="hidden" name="id" value={id} />
          <ConfirmButton variant="danger" size="sm" message={t("deleteConfirm", { name: vessel.name })}>
            {t("delete")}
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
