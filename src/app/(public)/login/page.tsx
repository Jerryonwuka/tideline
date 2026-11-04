import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { platformConfig } from "@/config/platform";
import { postLoginPath, safeNext } from "@/server/auth/session";
import { devToolsEnabled } from "@/server/env";
import { getMe } from "@/server/services/profile";
import { supabaseServer } from "@/server/supabase/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? "";
  const me = await getMe(await supabaseServer());
  if (me) redirect(postLoginPath(me, next || null));

  const locale = await getLocale();
  const countryName =
    new Intl.DisplayNames([locale], { type: "region" }).of(platformConfig.defaultPhoneCountry) ??
    platformConfig.defaultPhoneCountry;
  return (
    <AuthShell>
      <LoginForm next={next} countryName={countryName} devHint={devToolsEnabled()} />
    </AuthShell>
  );
}
