import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { requireMe } from "@/server/auth/session";
import { listEnabledCountries } from "@/server/services/countries";
import { OrgForm } from "./org-form";

export default async function OnboardingPage() {
  const { db, me } = await requireMe("/onboarding");
  if (!me.fullName) redirect("/onboarding/profile?next=/onboarding");
  const [locale, countries] = await Promise.all([getLocale(), listEnabledCountries(db)]);
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return (
    <AuthShell wide>
      <OrgForm
        countries={countries.map((c) => ({
          code: c.code,
          name: names.of(c.code) ?? c.name,
          currency: c.defaultCurrency,
          timeZone: c.defaultTimeZone,
        }))}
      />
    </AuthShell>
  );
}
