import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { requireAdmin } from "@/server/admin-console";

const changedKeys = (before: unknown, after: unknown) => {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => k !== "updated_at" && JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
};

/** §4.4 audit viewer. Shows which fields changed, never their values (they can hold personal data). */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { db } = await requireAdmin("/admin/audit");
  const sp = await searchParams;
  const entity = /^[a-z_]{2,40}$/.test(sp.entity ?? "") ? sp.entity : undefined;
  const org = /^[0-9a-f-]{36}$/.test(sp.org ?? "") ? sp.org : undefined;
  let q = db
    .from("audit_logs")
    .select("id, action, entity, entity_id, org_id, actor_user_id, before, after, at")
    .order("at", { ascending: false })
    .limit(200);
  if (entity) q = q.eq("entity", entity);
  if (org) q = q.eq("org_id", org);
  const [t, format, { data }] = await Promise.all([getTranslations("console.audit"), getFormatter(), q]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <form className="flex flex-wrap items-end gap-3">
        <span className="flex flex-col gap-1">
          <Label htmlFor="entity">{t("entity")}</Label>
          <Input id="entity" name="entity" defaultValue={entity ?? ""} className="w-48" />
        </span>
        <span className="flex flex-col gap-1">
          <Label htmlFor="org">{t("org")}</Label>
          <Input id="org" name="org" defaultValue={org ?? ""} className="w-80" />
        </span>
        <Button type="submit" variant="secondary">
          {t("filter")}
        </Button>
      </form>
      <ul className="rounded-md border border-hairline font-mono text-xs" data-testid="admin-audit">
        {(data ?? []).map((r) => {
          const keys = changedKeys(r.before, r.after);
          return (
            <li key={r.id} className="flex flex-col gap-0.5 border-b border-hairline px-4 py-2 last:border-b-0">
              <span className="text-foreground">
                {r.action} · {r.entity_id?.slice(0, 8)} ·{" "}
                {t("actor", { actor: r.actor_user_id?.slice(0, 8) ?? t("system") })}
              </span>
              <span className="text-meta">
                {format.dateTime(new Date(r.at), { dateStyle: "medium", timeStyle: "medium" })}
                {keys.length ? ` · ${t("changed", { fields: keys.slice(0, 12).join(", ") })}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
