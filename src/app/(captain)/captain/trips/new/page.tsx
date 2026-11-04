import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/auth/session";
import { myVessels } from "@/server/captain";
import { listRoutes } from "@/server/services/ferry";
import { NewTripForm } from "./new-trip-form";

export default async function NewCaptainTripPage() {
  const { db, me, membership } = await requireOrgContext("/captain/trips/new");
  const [t, vessels, routes] = await Promise.all([
    getTranslations("captain.newTrip"),
    myVessels(db, membership, me.userId),
    listRoutes(db, membership.orgId),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="heading text-foreground">{t("title")}</h1>
      <NewTripForm
        vessels={vessels.map((v) => ({ id: v.id, label: v.name }))}
        routes={routes
          .filter((r) => r.active)
          .map((r) => ({ id: r.id, label: `${r.origin?.name} → ${r.destination?.name}` }))}
      />
    </div>
  );
}
