import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { StepHeader } from "@/components/auth/step-header";
import { UploadForm } from "@/components/fleet/upload-form";
import { requireOrgContext } from "@/server/auth/session";
import { fleetCompliance } from "@/server/compliance/vessels";
import { getVessel } from "@/server/services/vessels";
import { uploadSubjects } from "@/server/upload-subjects";

export default async function OnboardingDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ vessel?: string }>;
}) {
  const vesselId = z.uuid().safeParse((await searchParams).vessel);
  if (!vesselId.success) redirect("/onboarding/invite");
  const { db, membership } = await requireOrgContext("/onboarding/documents");
  const [t, tAll, vessel, subjects] = await Promise.all([
    getTranslations("onboarding.documents"),
    getTranslations(),
    getVessel(db, vesselId.data),
    uploadSubjects(db, membership.orgId),
  ]);
  const [compliance] = await fleetCompliance(db, membership.orgId, [vessel]);
  const required = compliance?.requirements.filter((r) => r.mandatory) ?? [];
  return (
    <AuthShell wide>
      <StepHeader
        step={4}
        title={t("title")}
        subtitle={t("subtitle")}
        skipHref="/onboarding/invite"
        skipLabel={t("skip")}
      />
      {required.length > 0 && (
        <p className="mb-5 text-sm text-body">
          {t("required", { vessel: vessel.name })} {required.map((r) => tAll(r.nameKey)).join(", ")}
        </p>
      )}
      <UploadForm
        orgId={membership.orgId}
        subjects={subjects.filter((s) => s.id === vessel.id)}
        defaultType={required[0]?.documentTypeCode}
        next="/onboarding/invite"
      />
    </AuthShell>
  );
}
