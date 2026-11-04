import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { UploadForm } from "@/components/fleet/upload-form";
import { requireOrgContext, safeNext } from "@/server/auth/session";
import { uploadSubjects } from "@/server/upload-subjects";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; type?: string; next?: string }>;
}) {
  const { subject, type, next } = await searchParams;
  const { db, membership } = await requireOrgContext("/documents/new");
  const [t, subjects] = await Promise.all([getTranslations("fleet.upload"), uploadSubjects(db, membership.orgId)]);
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader title={t("title")} />
      <UploadForm
        orgId={membership.orgId}
        subjects={subjects}
        defaultSubject={subject}
        defaultType={type}
        next={safeNext(next) ?? undefined}
      />
    </div>
  );
}
