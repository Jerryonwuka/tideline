import { getFormatter, getTranslations } from "next-intl/server";
import { ManifestLookup } from "@/components/admin/console-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { requireAdmin } from "@/server/admin-console";

/** §12: admin reads of passenger data require a reason; the database logs each one. */
export default async function AdminPassengersPage() {
  const { db } = await requireAdmin("/admin/passengers");
  const [t, format, { data: log }] = await Promise.all([
    getTranslations("console.passengers"),
    getFormatter(),
    db
      .from("admin_access_logs")
      .select("id, subject_id, reason, rows_returned, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ManifestLookup />
      <section className="flex flex-col gap-2">
        <h2 className="title-md text-foreground">{t("log")}</h2>
        <ul className="rounded-md border border-hairline text-sm" data-testid="admin-access-log">
          {(log ?? []).map((l) => (
            <li key={l.id} className="flex flex-col border-b border-hairline px-4 py-2 last:border-b-0">
              <span className="text-foreground">{t("logRow", { reason: l.reason, rows: l.rows_returned })}</span>
              <span className="font-mono text-xs text-meta">
                {l.subject_id} · {format.dateTime(new Date(l.created_at), { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
