import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { FleetMap } from "@/components/map/fleet-map";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { liveFleet, MAP_REFRESH_MS } from "@/server/services/tracking";

export default async function MapPage() {
  const { db, membership } = await requireOrgContext("/map");
  const [t, org, fleet] = await Promise.all([
    getTranslations("map"),
    orgBasics(db, membership.orgId),
    liveFleet(db, membership.orgId, new Date(Date.now() - 24 * 60 * 60_000)),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <FleetMap orgId={membership.orgId} initial={fleet} timeZone={org.time_zone} refreshMs={MAP_REFRESH_MS} />
    </div>
  );
}
