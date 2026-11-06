import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { SideNav, type NavGroup } from "@/components/app/side-nav";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireMe } from "@/server/auth/session";

/** Platform admin console. Everyone else gets a 404, not a hint that it exists. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { me } = await requireMe("/admin/countries");
  if (!me.isPlatformAdmin) notFound();
  const t = await getTranslations("admin");
  const tDisputes = await getTranslations("adminDisputes");
  const tc = await getTranslations("console.nav");
  const tShell = await getTranslations("shell");

  const groups: NavGroup[] = [
    {
      label: tShell("groups.platform"),
      items: [
        { href: "/admin/countries", label: t("countries.title"), icon: "countries" },
        { href: "/admin/rule-sets", label: t("ruleSets.title"), icon: "ruleSets" },
        { href: "/admin/flags", label: tc("flags"), icon: "flags" },
        { href: "/admin/fees", label: tc("fees"), icon: "fees" },
        { href: "/admin/jetties", label: tc("jetties"), icon: "jetties" },
      ],
    },
    {
      label: tShell("groups.review"),
      items: [
        { href: "/admin/orgs", label: tc("orgs"), icon: "orgs" },
        { href: "/admin/documents", label: tc("documents"), icon: "reviewDocuments" },
        { href: "/admin/disputes", label: tDisputes("title"), icon: "disputes" },
        { href: "/admin/escrow", label: tc("escrow"), icon: "escrow" },
      ],
    },
    {
      label: tShell("groups.console"),
      items: [
        { href: "/admin/audit", label: tc("audit"), icon: "audit" },
        { href: "/admin/privacy", label: tc("privacy"), icon: "privacy" },
        { href: "/admin/passengers", label: tc("passengers"), icon: "passengers" },
      ],
    },
  ];

  return (
    <div className="min-h-dvh lg:pl-64">
      <SideNav
        groups={groups}
        home="/admin/countries"
        logo={<Logo size={20} />}
        top={
          <span className="w-fit rounded-xs border border-accent/50 px-2 py-0.5 label-mono-sm text-accent">
            {t("badge")}
          </span>
        }
        bottom={
          <div className="flex flex-col gap-3">
            <ThemeToggle className="w-fit" />
            {me.memberships.length > 0 && (
              <Link
                href="/dashboard"
                className="flex h-9 items-center gap-2 rounded-sm px-2 text-sm text-body hover:bg-surface-raised hover:text-foreground"
              >
                <ArrowLeft aria-hidden className="size-4" />
                {t("backToApp")}
              </Link>
            )}
          </div>
        }
        label={t("badge")}
        menuLabel={tShell("menu")}
        closeLabel={tShell("closeMenu")}
      />
      <main className="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
