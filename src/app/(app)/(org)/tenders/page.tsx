import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { ButtonLink } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { requireOrgContext } from "@/server/auth/session";

const TONE = { new: "neutral", parsed: "info", in_progress: "warning", exported: "success" } as const;

export default async function TendersPage() {
  const { db, membership } = await requireOrgContext("/tenders");
  const [t, format, { data }] = await Promise.all([
    getTranslations("tenders"),
    getFormatter(),
    db
      .from("tenders")
      .select("id, title, client_name, deadline, status")
      .eq("org_id", membership.orgId)
      .order("created_at", { ascending: false }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<ButtonLink href="/tenders/new">{t("new")}</ButtonLink>}
      />
      {!data?.length ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline" data-testid="tenders">
          {data.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3 last:border-b-0"
            >
              <span className="flex flex-col">
                <Link href={`/tenders/${r.id}`} className="text-foreground hover:underline">
                  {r.title}
                </Link>
                <span className="text-sm text-meta">
                  {[
                    r.client_name,
                    r.deadline
                      ? t("deadline", {
                          date: format.dateTime(new Date(`${r.deadline}T00:00:00Z`), {
                            dateStyle: "medium",
                            timeZone: "UTC",
                          }),
                        })
                      : t("noDeadline"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <StatusChip tone={TONE[r.status]}>{t(`status.${r.status}`)}</StatusChip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
