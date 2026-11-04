import { getTranslations } from "next-intl/server";
import { VesselForm } from "@/components/fleet/vessel-form";
import { PageHeader } from "@/components/fleet/page-header";
import { requireOrgContext } from "@/server/auth/session";
import { getOrg } from "@/server/services/orgs";

export default async function NewVesselPage() {
  const { db, membership } = await requireOrgContext("/vessels/new");
  const [t, org] = await Promise.all([getTranslations("fleet.vesselForm"), getOrg(db, membership.orgId)]);
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader title={t("title")} />
      <VesselForm orgModes={org.modes} />
    </div>
  );
}
