import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AppNav } from "@/components/app/app-nav";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireMe } from "@/server/auth/session";

/** Platform admin console. Everyone else gets a 404, not a hint that it exists. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { me } = await requireMe("/admin/countries");
  if (!me.isPlatformAdmin) notFound();
  const t = await getTranslations("admin");
  const tDisputes = await getTranslations("adminDisputes");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-hairline bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[84rem] items-center gap-4 px-4 sm:px-8">
          <Link href="/admin/countries" className="shrink-0">
            <Logo size={20} />
          </Link>
          <span className="rounded-xs border border-accent/50 px-2 py-0.5 label-mono-sm text-accent">{t("badge")}</span>
          <AppNav
            label={t("badge")}
            links={[
              { href: "/admin/countries", label: t("countries.title") },
              { href: "/admin/rule-sets", label: t("ruleSets.title") },
              { href: "/admin/disputes", label: tDisputes("title") },
            ]}
          />
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle className="hidden sm:inline-flex" />
            {me.memberships.length > 0 && (
              <Link href="/dashboard" className="text-sm text-body hover:text-foreground">
                {t("backToApp")}
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[84rem] flex-1 px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}
