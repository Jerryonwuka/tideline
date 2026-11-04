import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireOrgContext } from "@/server/auth/session";
import { markAllReadAction } from "./actions";

interface ExpiryPayload {
  documentId: string;
  document: string;
  subject: string;
  date: string;
  days: number;
}

export default async function NotificationsPage() {
  const { db, me, membership } = await requireOrgContext("/notifications");
  const [t, format] = await Promise.all([getTranslations("notifications"), getFormatter()]);
  const { data } = await db
    .from("notifications")
    .select("id, template, payload, sent_at, read_at")
    .eq("user_id", me.userId)
    .eq("org_id", membership.orgId)
    .order("sent_at", { ascending: false })
    .limit(100);
  const items = data ?? [];
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        title={t("title")}
        actions={
          items.some((n) => !n.read_at) && (
            <form action={markAllReadAction}>
              <Button type="submit" variant="secondary" size="sm">
                {t("markRead")}
              </Button>
            </form>
          )
        }
      />
      {items.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="rounded-md border border-hairline">
          {items.map((n) => {
            const p = n.payload as unknown as ExpiryPayload;
            return (
              <li key={n.id} className={cn("border-b border-hairline last:border-b-0", !n.read_at && "bg-accent-soft")}>
                <Link
                  href={`/documents/${p.documentId}`}
                  className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-surface"
                >
                  <span className="text-sm text-foreground">{t(`templates.${n.template}`, { ...p })}</span>
                  <span className="shrink-0 text-xs text-meta">{format.relativeTime(new Date(n.sent_at))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
