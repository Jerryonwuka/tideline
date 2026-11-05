import { getTranslations } from "next-intl/server";
import { flagAction } from "@/app/(app)/admin/console-actions";
import { ConsoleForm } from "@/components/admin/console-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { requireAdmin } from "@/server/admin-console";

export default async function AdminFlagsPage() {
  const { db } = await requireAdmin("/admin/flags");
  const [t, { data }] = await Promise.all([
    getTranslations("console.flags"),
    db.from("feature_flags").select("key, enabled, description, updated_at").order("key"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ul className="rounded-md border border-hairline" data-testid="admin-flags">
        {(data ?? []).map((f) => (
          <li
            key={f.key}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3 text-sm last:border-b-0"
          >
            <span className="flex max-w-[60ch] flex-col">
              <span className="font-mono text-foreground">{f.key}</span>
              <span className="text-meta">{f.description}</span>
            </span>
            <ConsoleForm action={flagAction} fields={{ key: f.key }} label={t("save")}>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name="enabled" defaultChecked={f.enabled} aria-label={`${f.key} ${t("on")}`} />
                {t("on")}
              </label>
            </ConsoleForm>
          </li>
        ))}
      </ul>
      <p className="text-sm text-meta">{t("envNote")}</p>
    </div>
  );
}
