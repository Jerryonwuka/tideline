import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { ReviewForm } from "@/components/fleet/review-form";
import { DocumentStatusChip } from "@/components/fleet/status";
import { requireOrgContext } from "@/server/auth/session";
import { getDocument } from "@/server/services/documents";
import { ServiceError } from "@/server/services/errors";
import { subjectNames } from "@/server/upload-subjects";

interface ExtractedDraft {
  number: string | null;
  issuer: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  review: { lowConfidence: string[]; flags: string[]; suggestedExpiry: string | null };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, membership } = await requireOrgContext(`/documents/${id}`);
  const doc = await getDocument(db, id).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const [t, tAll, format, names] = await Promise.all([
    getTranslations("fleet.document"),
    getTranslations(),
    getFormatter(),
    subjectNames(db, membership.orgId),
  ]);
  const canManage = membership.role === "owner" || membership.role === "manager";
  const date = (d: string | null) => (d ? format.dateTime(new Date(`${d}T00:00:00`), { dateStyle: "medium" }) : "—");
  const isPdf = doc.file_path?.endsWith(".pdf");
  const needsReview = doc.effective_status === "needs_review";
  const extracted = doc.extracted as unknown as ExtractedDraft | null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={tAll(`documentTypes.${doc.document_type_code}`)}
        subtitle={names.get(doc.subject_id ?? "")}
        eyebrow={
          doc.effective_status && (
            <span className="w-fit">
              <DocumentStatusChip status={doc.effective_status} />
            </span>
          )
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label={t("preview")} className="flex flex-col gap-2">
          {doc.fileUrl ? (
            <>
              {isPdf ? (
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-hairline p-6 text-accent hover:underline"
                >
                  {t("openFile")}
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
                <img
                  data-doc-preview
                  src={doc.fileUrl}
                  alt={t("preview")}
                  className="max-h-[70vh] w-full rounded-md border border-hairline object-contain"
                />
              )}
              <span className="text-xs text-meta">{t("linkExpires")}</span>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-hairline-strong p-6 text-sm text-meta">
              {t("noFile")}
            </p>
          )}
        </section>
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="label-mono-sm text-meta">{t("fields.number")}</dt>
            <dd className="font-mono text-foreground">{doc.number ?? "—"}</dd>
            <dt className="label-mono-sm text-meta">{t("fields.issuer")}</dt>
            <dd className="text-foreground">{doc.issuer ?? "—"}</dd>
            <dt className="label-mono-sm text-meta">{t("fields.issueDate")}</dt>
            <dd className="text-foreground">{date(doc.issue_date)}</dd>
            <dt className="label-mono-sm text-meta">{t("fields.expiryDate")}</dt>
            <dd className="text-foreground">{date(doc.expiry_date)}</dd>
          </dl>
          {doc.reviewed_at && (
            <p className="text-xs text-meta">
              {t("reviewed", { date: format.dateTime(new Date(doc.reviewed_at), { dateStyle: "medium" }) })}
            </p>
          )}
          {needsReview && extracted && (
            <section aria-labelledby="read" className="flex flex-col gap-2 rounded-md border border-hairline p-4">
              <h2 id="read" className="label-mono-sm text-accent">
                {t("readTitle")}
              </h2>
              <p className="text-xs text-meta">{t("readBody")}</p>
              {extracted.review.flags.length > 0 && (
                <ul className="mt-1 flex flex-col gap-1">
                  {extracted.review.flags.map((f) => (
                    <li key={f} className="text-sm text-warning">
                      {t(`flags.${f}`)}
                    </li>
                  ))}
                </ul>
              )}
              {extracted.review.suggestedExpiry && (
                <p className="text-sm text-body">
                  {t("suggestedExpiry", { date: date(extracted.review.suggestedExpiry) })}
                </p>
              )}
            </section>
          )}
          {needsReview && !extracted && doc.file_path && <p className="text-sm text-body">{t("extractionFailed")}</p>}
          {canManage && needsReview && doc.id && (
            <ReviewForm
              id={doc.id}
              values={{
                number: doc.number ?? extracted?.number ?? null,
                issuer: doc.issuer ?? extracted?.issuer ?? null,
                issue_date: doc.issue_date ?? extracted?.issue_date ?? null,
                expiry_date: doc.expiry_date ?? extracted?.expiry_date ?? null,
              }}
              lowConfidence={extracted?.review.lowConfidence}
            />
          )}
        </div>
      </div>
    </div>
  );
}
