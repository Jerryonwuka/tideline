import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { StepHeader } from "@/components/auth/step-header";
import { CrewForm } from "@/components/fleet/crew-form";
import { requireOrgContext } from "@/server/auth/session";

/** Step 5: the captain becomes a crew record and gets an app invitation in one go. */
export default async function OnboardingInvitePage() {
  await requireOrgContext("/onboarding/invite");
  const t = await getTranslations("onboarding.invite");
  return (
    <AuthShell wide>
      <StepHeader step={5} title={t("title")} subtitle={t("subtitle")} skipHref="/dashboard" skipLabel={t("skip")} />
      <CrewForm defaultRole="captain" lockRole inviteDefault next="/dashboard" />
    </AuthShell>
  );
}
