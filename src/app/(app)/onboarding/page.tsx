import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { platformConfig } from "@/config/platform";
import { requireMe } from "@/server/auth/session";
import { OrgForm } from "./org-form";

export default async function OnboardingPage() {
  const { me } = await requireMe("/onboarding");
  if (!me.fullName) redirect("/onboarding/profile?next=/onboarding");
  const locale = await getLocale();
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const countries = platformConfig.signupCountries.map((code) => ({ code, name: names.of(code) ?? code }));
  return (
    <AuthShell wide>
      <OrgForm countries={countries} />
    </AuthShell>
  );
}
