import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { DocumentStatusChip } from "@/components/fleet/status";
import { ButtonLink } from "@/components/ui/button";
import type { DocumentStatus } from "@/lib/schemas/fleet";
import { cn } from "@/lib/utils";
import { requireOrgContext } from "@/server/auth/session";
import { listDocuments } from "@/server/services/documents";
import { subjectNames } from "@/server/upload-subjects";

const TABS = ["all", "expiring", "expired", "needs_review"] as const;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const tab = (TABS as readonly string[]).includes(status ?? "") ? (status as (typeof TABS)[number]) : "all";
  const { db, membership } = await requireOrgContext("/documents");
  const [t, tAll, format, docs, names] = await Promise.all([
    getTranslations("fleet.documents"),
    getTranslations(),
    getFormatter(),
    listDocuments(db, { orgId: membership.orgId, status: tab === "all" ? undefined : (tab as DocumentStatus) }),
    subjectNames(db, membership.orgId),
  ]);
  const canManage = membership.role === "owner" || membership.role === "manager";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={canManage && <ButtonLink href="/documents/new">{t("add")}</ButtonLink>}
      />
      <nav
        aria-label={t("title")}
        className="flex w-fit max-w-full overflow-x-auto rounded-xs border border-hairline-strong"
      >
        {TABS.map((key) => (
          <Link
            key={key}
            href={key === "all" ? "/documents" : `/documents?status=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "px-4 py-2 label-mono-sm whitespace-nowrap not-last:border-r not-last:border-hairline-strong",
              tab === key ? "bg-primary text-primary-foreground" : "text-meta hover:text-foreground",
            )}
          >
            {t(`tabs.${key}`)}
          </Link>
        ))}
      </nav>
      {docs.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline label-mono-sm text-meta">
                <th className="px-4 py-3 font-medium">{t("columns.document")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.for")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.number")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.expires")}</th>
                <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-hairline last:border-b-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/documents/${d.id}`} className="text-foreground hover:text-accent">
                      {tAll(`documentTypes.${d.document_type_code}`)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-body">{names.get(d.subject_id ?? "") ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-body">{d.number ?? "—"}</td>
                  <td className="px-4 py-3 text-body">
                    {d.expiry_date ? (
                      <>
                        {format.dateTime(new Date(`${d.expiry_date}T00:00:00`), { dateStyle: "medium" })}
                        <span className="ml-2 text-xs text-meta">
                          {d.days_to_expiry != null && d.days_to_expiry < 0
                            ? t("daysAgo", { days: -d.days_to_expiry })
                            : t("daysLeft", { days: d.days_to_expiry ?? 0 })}
                        </span>
                      </>
                    ) : (
                      <span className="text-meta">{t("noExpiry")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {d.effective_status && <DocumentStatusChip status={d.effective_status} />}
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
