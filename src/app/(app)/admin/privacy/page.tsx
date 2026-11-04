import { getFormatter, getTranslations } from "next-intl/server";
import { privacyAction } from "@/app/(app)/admin/console-actions";
import { ConsoleForm } from "@/components/admin/console-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { requireAdmin } from "@/server/admin-console";
import { adminRequests } from "@/server/services/privacy";
import { supabaseAdmin } from "@/server/supabase/admin";

/** §12 rights queue: export and deletion requests with due dates. */
export default async function AdminPrivacyPage() {
  const { db } = await requireAdmin("/admin/privacy");
  const [t, format, requests] = await Promise.all([
    getTranslations("console.privacy"),
    getFormatter(),
    adminRequests(db),
  ]);
  const ids = [...new Set(requests.map((r) => r.user_id).filter((x): x is string => !!x))];
  const { data: people } = ids.length
    ? await supabaseAdmin().from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const now = Date.now();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {!requests.length ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline" data-testid="admin-privacy">
          {requests.map((r) => (
            <li
              key={r.id}
              data-testid="admin-privacy-request"
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3 text-sm last:border-b-0"
            >
              <span className="flex flex-col">
                <span className="text-foreground">
                  {t(`kind.${r.kind}`)} · {(r.user_id && name.get(r.user_id)) || "—"}
                </span>
                <span className="text-meta">
                  {t("due", { date: format.dateTime(new Date(r.due_at), { dateStyle: "medium" }) })}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {r.status === "pending" && new Date(r.due_at).getTime() < now && (
                  <StatusChip tone="danger">{t("overdue")}</StatusChip>
                )}
                <StatusChip tone={r.status === "completed" ? "success" : r.status === "pending" ? "info" : "neutral"}>
                  {t(`status.${r.status}`)}
                </StatusChip>
                {r.status === "pending" && (
                  <>
                    <ConsoleForm
                      action={privacyAction}
                      fields={{ id: r.id, op: r.kind }}
                      label={r.kind === "export" ? t("prepare") : t("erase")}
                      variant={r.kind === "delete" ? "danger" : "primary"}
                    />
                    <ConsoleForm
                      action={privacyAction}
                      fields={{ id: r.id, op: "reject" }}
                      label={t("reject")}
                      variant="ghost"
                    />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
