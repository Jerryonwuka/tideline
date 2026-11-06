import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Bell, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NativeSelect } from "@/components/ui/select";
import type { Role } from "@/lib/schemas/common";
import { signOutAction } from "@/server/auth/actions";
import { flagEnabled } from "@/server/features";
import type { Me, MembershipSummary } from "@/server/services/profile";
import { supabaseServer } from "@/server/supabase/server";
import { switchOrgAction } from "@/app/(app)/(org)/actions";
import { SideNav, type NavGroup, type NavItem } from "./side-nav";

const MANAGES_TEAM: Role[] = ["owner", "manager"];

/** Signed-in frame: sidebar with the company, grouped sections and account; page on the right. */
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
  const owner = membership.role === "owner";
  const charter = await flagEnabled("charter");

  const when = <T,>(cond: boolean, items: T[]) => (cond ? items : []);
  const groups: NavGroup[] = [
    {
      items: [
        { href: "/dashboard", label: t("dashboard"), icon: "dashboard" },
        { href: "/notifications", label: t("notifications"), icon: "notifications", badge: unread ?? 0 },
        ...when<NavItem>(manages, [{ href: "/assistant", label: t("assistant"), icon: "assistant" }]),
      ],
    },
    ...when<NavGroup>(manages, [
      {
        label: t("groups.operations"),
        items: [
          { href: "/trips", label: t("trips"), icon: "trips" },
          { href: "/map", label: t("map"), icon: "map" },
          { href: "/routes", label: t("routes"), icon: "routes" },
          { href: "/safety", label: t("safety"), icon: "safety" },
          { href: "/reports/daily", label: t("reports"), icon: "reports" },
        ],
      },
    ]),
    {
      label: t("groups.fleet"),
      items: [
        { href: "/vessels", label: t("vessels"), icon: "vessels" },
        ...when<NavItem>(manages, [
          { href: "/crew", label: t("crew"), icon: "crew" },
          { href: "/documents", label: t("documents"), icon: "documents" },
        ]),
      ],
    },
    ...when<NavGroup>(manages && charter, [
      {
        label: t("groups.charter"),
        items: [
          { href: "/charters", label: t("charters"), icon: "charters" },
          { href: "/tenders", label: t("tenders"), icon: "tenders" },
        ],
      },
    ]),
    ...when<NavGroup>(manages, [
      {
        label: t("groups.money"),
        items: [
          { href: "/invoices", label: t("invoices"), icon: "invoices" },
          ...when<NavItem>(owner, [
            { href: "/payouts", label: t("payouts"), icon: "payouts" },
            { href: "/billing", label: t("billing"), icon: "billing" },
          ]),
        ],
      },
    ]),
    {
      label: t("groups.company"),
      items: [
        ...when<NavItem>(manages, [{ href: "/members", label: t("members"), icon: "team" }]),
        { href: "/captain", label: t("captain"), icon: "captain" },
        { href: "/settings/privacy", label: t("privacy"), icon: "privacy" },
        ...when<NavItem>(me.isPlatformAdmin, [{ href: "/admin/countries", label: t("admin"), icon: "admin" }]),
      ],
    },
  ];

  const company = (
    <div className="flex flex-col gap-2">
      {orgs.length > 1 ? (
        <form action={switchOrgAction}>
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
        <p className="truncate text-sm font-medium text-foreground">{membership.orgName}</p>
      )}
      <span className="w-fit rounded-xs border border-hairline-strong px-2 py-0.5 label-mono-sm text-meta">
        {tRoles(membership.role)}
      </span>
    </div>
  );

  const account = (
    <div className="flex flex-col gap-3">
      <ThemeToggle className="w-fit" />
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-raised text-xs font-medium text-foreground"
        >
          {initials(me.fullName ?? "")}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{me.fullName}</span>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label={t("signOut")}
            title={t("signOut")}
            className="flex size-8 cursor-pointer items-center justify-center rounded-xs text-body hover:bg-surface-raised hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );

  const bell = (
    <Link
      href="/notifications"
      aria-label={`${t("notifications")}${unread ? ` (${unread})` : ""}`}
      className="relative flex size-10 items-center justify-center rounded-xs text-body hover:bg-surface-raised hover:text-foreground"
    >
      <Bell className="size-5" />
      {!!unread && (
        <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-medium text-accent-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <SideNav
        groups={groups}
        home="/dashboard"
        logo={<Logo size={20} />}
        top={company}
        bottom={account}
        mobileBar={bell}
        label={t("menu")}
        menuLabel={t("menu")}
        closeLabel={t("closeMenu")}
      />
      <main className="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}
