import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { requireAdmin } from "@/server/admin-console";
import { supabaseAdmin } from "@/server/supabase/admin";

/** §4.4 review queue: documents the reader was unsure about, platform-wide (read-only). */
export default async function AdminDocumentsPage() {
  await requireAdmin("/admin/documents");
  const [t, tTypes, format, { data }] = await Promise.all([
    getTranslations("console.documents"),
    getTranslations("documentTypes"),
    getFormatter(),
    supabaseAdmin()
      .from("documents")
      .select("id, document_type_code, subject_type, extraction_confidence, created_at, org:orgs(name)")
      .eq("status", "needs_review")
      .lt("extraction_confidence", 0.8)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {!data?.length ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline">
          {data.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3 text-sm last:border-b-0"
            >
              <span className="flex flex-col">
                <span className="text-foreground">
                  {tTypes.has(d.document_type_code) ? tTypes(d.document_type_code) : d.document_type_code}
                </span>
                <span className="text-meta">
                  {d.org?.name} · {d.subject_type} · {format.dateTime(new Date(d.created_at), { dateStyle: "medium" })}
                </span>
              </span>
              <StatusChip tone="warning">
                {t("confidence", { value: Math.round(Number(d.extraction_confidence ?? 0) * 100) })}
              </StatusChip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
