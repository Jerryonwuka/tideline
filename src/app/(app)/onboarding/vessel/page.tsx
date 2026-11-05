import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { StepHeader } from "@/components/auth/step-header";
import { VesselForm } from "@/components/fleet/vessel-form";
import { requireOrgContext } from "@/server/auth/session";
import { getOrg } from "@/server/services/orgs";

export default async function OnboardingVesselPage() {
  const { db, membership } = await requireOrgContext("/onboarding/vessel");
  const [t, org] = await Promise.all([getTranslations("onboarding.vessel"), getOrg(db, membership.orgId)]);
  return (
    <AuthShell wide>
      <StepHeader
        step={3}
        title={t("title")}
        subtitle={t("subtitle")}
        skipHref="/onboarding/invite"
        skipLabel={t("skip")}
      />
      <VesselForm orgModes={org.modes} next="/onboarding/documents?vessel={id}" />
    </AuthShell>
  );
}
