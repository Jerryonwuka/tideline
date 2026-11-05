import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { requireOrgContext } from "@/server/auth/session";

export default async function OrgLayout({ children }: { children: ReactNode }) {
  const { db, me, membership } = await requireOrgContext("/dashboard");
  // Read-only after a lapsed subscription (§11): say so on every screen; trips still work.
  const { count } = await db
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", membership.orgId)
    .in("status", ["read_only", "cancelled"]);
  const t = await getTranslations("billing");
  return (
    <AppShell me={me} membership={membership}>
      {!!count && (
        <p role="status" className="mb-6 rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          {t("readOnlyBanner")}{" "}
          {membership.role === "owner" && (
            <Link href="/billing" className="underline">
              {t("renew")}
            </Link>
          )}
        </p>
      )}
      {children}
    </AppShell>
  );
}
