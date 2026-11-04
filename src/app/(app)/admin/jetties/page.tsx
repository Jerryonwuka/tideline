import { getTranslations } from "next-intl/server";
import { jettyAction } from "@/app/(app)/admin/console-actions";
import { ConsoleForm } from "@/components/admin/console-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { requireAdmin } from "@/server/admin-console";

export default async function AdminJettiesPage() {
  const { db } = await requireAdmin("/admin/jetties");
  const [t, { data }] = await Promise.all([
    getTranslations("console.jetties"),
    db
      .from("jetties")
      .select("id, name, country_code, admin_area, status")
      .order("status", { ascending: false })
      .order("name")
      .limit(500),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {!data?.length ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline">
          {data.map((j) => (
            <li
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-2 text-sm last:border-b-0"
            >
              <span className="text-foreground">
                {j.name}{" "}
                <span className="text-meta">· {[j.admin_area, j.country_code].filter(Boolean).join(", ")}</span>
              </span>
              <span className="flex items-center gap-3">
                <StatusChip tone={j.status === "active" ? "success" : "warning"}>{t(`status.${j.status}`)}</StatusChip>
                {j.status === "proposed" && (
                  <ConsoleForm action={jettyAction} fields={{ id: j.id }} label={t("approve")} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
