import { getFormatter, getTranslations } from "next-intl/server";
import { verifyOrgAction } from "@/app/(app)/admin/console-actions";
import { ConsoleForm } from "@/components/admin/console-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { requireAdmin } from "@/server/admin-console";

const ORDER = { pending: 0, unverified: 1, verified: 2 } as const;

export default async function AdminOrgsPage() {
  const { db } = await requireAdmin("/admin/orgs");
  const [t, format, { data }] = await Promise.all([
    getTranslations("console.orgs"),
    getFormatter(),
    db
      .from("orgs")
      .select("id, name, type, country_code, verification_status, registration_number, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const rows = [...(data ?? [])].sort((a, b) => ORDER[a.verification_status] - ORDER[b.verification_status]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {!rows.length ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline" data-testid="admin-orgs">
          {rows.map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3 text-sm last:border-b-0"
            >
              <span className="flex flex-col">
                <span className="text-foreground">{o.name}</span>
                <span className="text-meta">
                  {[
                    o.type.replace(/_/g, " "),
                    o.country_code,
                    o.registration_number,
                    format.dateTime(new Date(o.created_at), { dateStyle: "medium" }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <StatusChip
                  tone={
                    o.verification_status === "verified"
                      ? "success"
                      : o.verification_status === "pending"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {t(`status.${o.verification_status}`)}
                </StatusChip>
                <ConsoleForm
                  action={verifyOrgAction}
                  fields={{ id: o.id, status: o.verification_status === "verified" ? "unverified" : "verified" }}
                  label={o.verification_status === "verified" ? t("unverify") : t("verify")}
                  variant={o.verification_status === "verified" ? "ghost" : "secondary"}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
