import Link from "next/link";
import { flagEnabled } from "@/server/features";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NativeSelect } from "@/components/ui/select";
import { Bell } from "lucide-react";
import type { Role } from "@/lib/schemas/common";
import { signOutAction } from "@/server/auth/actions";
import type { Me, MembershipSummary } from "@/server/services/profile";
import { switchOrgAction } from "@/app/(app)/(org)/actions";
import { AppNav } from "./app-nav";
import { supabaseServer } from "@/server/supabase/server";

const MANAGES_TEAM: Role[] = ["owner", "manager"];

/** Signed-in frame: company switcher, navigation, theme and account. */
export async function AppShell({
  me,
  membership,
  children,
}: {
  me: Me;
  membership: MembershipSummary;
  children: ReactNode;
}) {
  const t = await getTranslations("shell");
  const tRoles = await getTranslations("roles");
  const orgs = me.memberships.filter((m) => m.status === "active");
  const { count: unread } = await (
    await supabaseServer()
  )
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", me.userId)
    .eq("org_id", membership.orgId)
    .is("read_at", null);
  const manages = MANAGES_TEAM.includes(membership.role);
  const charter = await flagEnabled("charter");
  const links = [
    { href: "/dashboard", label: t("dashboard") },
    { href: "/vessels", label: t("vessels") },
    ...(manages
      ? [
          { href: "/trips", label: t("trips") },
          { href: "/map", label: t("map") },
          { href: "/routes", label: t("routes") },
          { href: "/safety", label: t("safety") },
          { href: "/reports/daily", label: t("reports") },
          { href: "/assistant", label: t("assistant") },
          ...(charter ? [{ href: "/charters", label: t("charters") }] : []),
          { href: "/invoices", label: t("invoices") },
          ...(charter ? [{ href: "/tenders", label: t("tenders") }] : []),
          ...(membership.role === "owner" ? [{ href: "/payouts", label: t("payouts") }] : []),
          { href: "/crew", label: t("crew") },
          { href: "/documents", label: t("documents") },
          { href: "/members", label: t("members") },
          ...(membership.role === "owner" ? [{ href: "/billing", label: t("billing") }] : []),
        ]
      : []),
    { href: "/captain", label: t("captain") },
    { href: "/settings/privacy", label: t("privacy") },
    ...(me.isPlatformAdmin ? [{ href: "/admin/countries", label: t("admin") }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-hairline bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[84rem] items-center gap-4 px-4 sm:px-8">
          <Link href="/dashboard" className="shrink-0 rounded-xs focus-visible:outline-2 focus-visible:outline-accent">
            <Logo size={20} />
          </Link>
          <span aria-hidden className="h-5 w-px bg-hairline-strong" />
          {orgs.length > 1 ? (
            <form action={switchOrgAction} className="w-48">
              <label htmlFor="org-switch" className="sr-only">
                {t("switchOrg")}
              </label>
              <NativeSelect
                id="org-switch"
                name="orgId"
                defaultValue={membership.orgId}
                className="h-9 text-sm"
                data-autosubmit
              >
                {orgs.map((m) => (
                  <option key={m.orgId} value={m.orgId}>
                    {m.orgName}
                  </option>
                ))}
              </NativeSelect>
              <noscript>
                <button type="submit">{t("switchOrg")}</button>
              </noscript>
            </form>
          ) : (
            <span className="truncate text-sm text-foreground">{membership.orgName}</span>
          )}
          <span className="hidden rounded-xs border border-hairline-strong px-2 py-0.5 label-mono-sm text-meta sm:inline">
            {tRoles(membership.role)}
          </span>
          <AppNav links={links} label={t("menu")} />
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/notifications"
              aria-label={`${t("notifications")}${unread ? ` (${unread})` : ""}`}
              className="relative flex size-8 items-center justify-center rounded-xs text-body hover:bg-surface-raised hover:text-foreground"
            >
              <Bell className="size-4" />
              {!!unread && (
                <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-medium text-accent-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <ThemeToggle className="hidden sm:inline-flex" />
            <span className="hidden text-sm text-body md:inline">{me.fullName}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="cursor-pointer rounded-xs px-2 py-1 text-sm text-body hover:bg-surface-raised hover:text-foreground"
              >
                {t("signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[84rem] flex-1 px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}
