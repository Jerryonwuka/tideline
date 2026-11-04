import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { signOutAction } from "@/server/auth/actions";
import { requireOrgContext } from "@/server/auth/session";

/**
 * Captain screens: light, one-handed, high contrast, big tap targets (BUILD_SPEC §8).
 * No dashboard chrome, charts or maps here.
 */
export default async function CaptainLayout({ children }: { children: ReactNode }) {
  const { membership } = await requireOrgContext("/captain");
  const t = await getTranslations("captain");
  const tShell = await getTranslations("shell");
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <Link href="/captain" className="flex items-center gap-2">
          <Logo variant="icon" size={22} />
          <span className="truncate text-sm text-foreground">{membership.orgName}</span>
        </Link>
        <div className="flex items-center gap-3">
          {(membership.role === "owner" || membership.role === "manager") && (
            <Link href="/dashboard" className="text-sm text-body">
              {t("backToApp")}
            </Link>
          )}
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-body">
              {tShell("signOut")}
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
