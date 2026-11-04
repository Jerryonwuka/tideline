import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import {
  MapDocumentForm,
  SectionEditor,
  SubmitAnywayForm,
  TenderButton,
  VesselPicker,
} from "@/components/tenders/tender-forms";
import { StatusChip } from "@/components/ui/chip";
import { SECTIONS, type ItemStatus } from "@/lib/tenders";
import { requireOrgContext } from "@/server/auth/session";
import { signedPdfUrl } from "@/server/services/contracts";
import { ServiceError } from "@/server/services/errors";
import { packState } from "@/server/services/tenders";

const ITEM_TONE: Record<ItemStatus, "success" | "warning" | "danger" | "neutral"> = {
  valid: "success",
  expires_before_deadline: "warning",
  missing: "danger",
  unmatched: "neutral",
};

type Parsed = {
  contract_period?: string | null;
  vessel_requirements?: Record<string, string | number | null>;
  dropped?: number;
};
type Item = { status: ItemStatus; document_id: string | null; manual?: boolean };

export default async function TenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, membership } = await requireOrgContext(`/tenders/${id}`);
  const t = await getTranslations("tenders");
  const format = await getFormatter();
  const { data: tender } = await db
    .from("tenders")
    .select("id, title, client_name, deadline, status, parsed")
    .eq("id", id)
    .maybeSingle();
  if (!tender) notFound();
  const header = (
    <PageHeader
      title={tender.title}
      subtitle={[
        tender.client_name,
        tender.deadline
          ? t("deadline", {
              date: format.dateTime(new Date(`${tender.deadline}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }),
            })
          : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    />
  );
  if (!tender.parsed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-body">{t("notRead")}</p>
        <TenderButton tenderId={id} kind="parse" label={t("readAgain")} variant="primary" />
      </div>
    );
  }

  let state;
  try {
    state = await packState(db, id);
  } catch (err) {
    if (err instanceof ServiceError) notFound();
    throw err;
  }
  const { pack, requirements, blockers } = state;
  const parsed = tender.parsed as Parsed;
  const items = pack.items as Record<string, Item>;
  const sections = pack.sections as Record<string, string>;
  const [{ data: vessels }, { data: docs }, pdfUrl, zipUrl] = await Promise.all([
    db.from("vessels").select("id, name").eq("org_id", membership.orgId).order("name"),
    db
      .from("documents_live")
      .select("id, document_type_code, subject_type, subject_id, expiry_date")
      .eq("org_id", membership.orgId),
    signedPdfUrl(pack.export_path),
    signedPdfUrl(pack.zip_path),
  ]);
  const vesselName = new Map((vessels ?? []).map((v) => [v.id, v.name]));
  const documents = (docs ?? []).map((d) => ({
    id: d.id!,
    label: [
      (d.document_type_code ?? "").replace(/_/g, " "),
      d.subject_type === "vessel" ? vesselName.get(d.subject_id ?? "") : d.subject_type,
      d.expiry_date,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
  const drafted = SECTIONS.some((s) => sections[s]);
  const needs = Object.entries(parsed.vessel_requirements ?? {}).filter(([, v]) => v !== null && v !== "");

  return (
    <div className="flex flex-col gap-10">
      {header}

      <section className="flex flex-col gap-3">
        <h2 className="title-md text-foreground">{t("summary")}</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
          {parsed.contract_period && (
            <>
              <dt className="text-meta">{t("contractPeriod")}</dt>
              <dd className="text-foreground">{parsed.contract_period}</dd>
            </>
          )}
          {needs.length > 0 && (
            <>
              <dt className="text-meta">{t("vesselNeeds")}</dt>
              <dd className="text-foreground">{needs.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}</dd>
            </>
          )}
        </dl>
        {!!parsed.dropped && <p className="text-sm text-meta">{t("dropped", { count: parsed.dropped })}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="title-md text-foreground">{t("vessels")}</h2>
        <p className="text-sm text-meta">{t("vesselsHint")}</p>
        {vessels?.length ? (
          <VesselPicker tenderId={id} vessels={vessels} selected={pack.vessel_ids} />
        ) : (
          <p className="text-body">{t("noVessels")}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="title-md text-foreground">{t("checklist")}</h2>
        <p className="text-sm text-meta">{t("checklistHint")}</p>
        <ul className="rounded-md border border-hairline" data-testid="tender-checklist">
          {requirements.map((r) => {
            const item = items[r.id] ?? { status: "unmatched" as const, document_id: null };
            return (
              <li
                key={r.id}
                data-testid="tender-item"
                data-status={item.status}
                className="flex flex-col gap-3 border-b border-hairline px-5 py-4 last:border-b-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex max-w-[70ch] flex-col gap-1">
                    <span className="text-sm text-foreground">
                      <span className="font-mono text-meta">{r.id}</span> {r.description}
                    </span>
                    <blockquote className="border-l-2 border-hairline-strong pl-3 text-sm text-body">
                      “{r.source_text}”
                    </blockquote>
                  </div>
                  <span className="flex items-center gap-2">
                    {r.mandatory && <StatusChip tone="neutral">{t("mandatory")}</StatusChip>}
                    <StatusChip tone={ITEM_TONE[item.status]}>{t(`itemStatus.${item.status}`)}</StatusChip>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <MapDocumentForm
                    tenderId={id}
                    requirementId={r.id}
                    documents={documents}
                    current={item.document_id}
                  />
                  {item.manual && <span className="text-sm text-meta">{t("manual")}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="title-md text-foreground">{t("sections")}</h2>
            <p className="text-sm text-meta">{t("sectionsHint")}</p>
          </div>
          <TenderButton
            tenderId={id}
            kind="draft"
            label={drafted ? t("redraft") : t("draft")}
            variant={drafted ? "secondary" : "primary"}
          />
        </div>
        {drafted ? (
          SECTIONS.map((s) => <SectionEditor key={s} tenderId={id} section={s} text={sections[s] ?? ""} />)
        ) : (
          <p className="text-body">{t("notDrafted")}</p>
        )}
      </section>

      {drafted && (
        <section className="flex flex-col gap-4 rounded-md border border-hairline p-5" data-testid="tender-export">
          <h2 className="title-md text-foreground">{t("review")}</h2>
          {pack.status === "draft" ? (
            <>
              <p className="text-sm text-body">{t("needsReview")}</p>
              <TenderButton tenderId={id} kind="review" label={t("markReviewed")} />
            </>
          ) : (
            <StatusChip tone="success" className="w-fit">
              {t("reviewed")}
            </StatusChip>
          )}
          {blockers.blocked && (
            <div className="flex flex-col gap-2 text-sm" data-testid="tender-held">
              <p className="text-danger">{t("held")}</p>
              <ul className="list-disc pl-5 text-body">
                {blockers.markers.length > 0 && <li>{t("heldMarkers", { count: blockers.markers.length })}</li>}
                {blockers.redMandatory.length > 0 && <li>{t("heldRed", { ids: blockers.redMandatory.join(", ") })}</li>}
              </ul>
              <SubmitAnywayForm tenderId={id} on={pack.submit_anyway} />
              {pack.submit_anyway && <p className="text-meta">{t("submitAnywayOn")}</p>}
            </div>
          )}
          <TenderButton tenderId={id} kind="export" label={t("export")} variant="primary" />
          {pack.exported_at && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-meta">
                {t("exported", {
                  date: format.dateTime(new Date(pack.exported_at), { dateStyle: "medium", timeStyle: "short" }),
                })}
              </span>
              {pdfUrl && (
                <a href={pdfUrl} className="text-accent hover:underline" data-testid="tender-pdf">
                  {t("downloadPdf")}
                </a>
              )}
              {zipUrl && (
                <a href={zipUrl} className="text-accent hover:underline" data-testid="tender-zip">
                  {t("downloadZip")}
                </a>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
