import { getTranslations } from "next-intl/server";
import { CrewForm } from "@/components/fleet/crew-form";
import { PageHeader } from "@/components/fleet/page-header";
import { requireOrgContext } from "@/server/auth/session";

export default async function NewCrewPage() {
  await requireOrgContext("/crew/new");
  const t = await getTranslations("fleet.crewForm");
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader title={t("title")} />
      <CrewForm />
    </div>
  );
}
