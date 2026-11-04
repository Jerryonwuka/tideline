import { getTranslations } from "next-intl/server";
import { AssistantChat } from "@/components/app/assistant-chat";
import { PageHeader } from "@/components/fleet/page-header";
import { requireOrgContext } from "@/server/auth/session";

export default async function AssistantPage() {
  const { membership } = await requireOrgContext("/assistant");
  const t = await getTranslations("assistant");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <AssistantChat orgId={membership.orgId} />
    </div>
  );
}
