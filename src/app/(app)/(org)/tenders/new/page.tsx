import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { NewTenderForm } from "@/components/tenders/tender-forms";
import { requireOrgContext } from "@/server/auth/session";

export default async function NewTenderPage() {
  await requireOrgContext("/tenders/new");
  const t = await getTranslations("tenders");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("new")} subtitle={t("subtitle")} />
      <NewTenderForm />
    </div>
  );
}
