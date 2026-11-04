import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TripStatusChip } from "@/components/ferry/trip-status";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { ServiceError } from "@/server/services/errors";
import { getTrip, listManifest, tripLabel } from "@/server/services/ferry";
import { CaptainTripControls } from "./controls";

export default async function CaptainTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, membership } = await requireOrgContext(`/captain/trips/${id}`);
  const trip = await getTrip(db, id).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const [t, org, manifest] = await Promise.all([
    getTranslations("captain.trip"),
    orgBasics(db, membership.orgId),
    listManifest(db, id),
  ]);
  const namesRequired = (org.settings as { require_passenger_names?: boolean } | null)?.require_passenger_names ?? true;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/captain" className="text-sm text-body">
        ← {t("back")}
      </Link>
      <div className="flex flex-col gap-2">
        <TripStatusChip status={trip.status} className="w-fit" />
        <h1 className="heading text-foreground">{tripLabel(trip)}</h1>
        <p className="text-body">{trip.vessel?.name}</p>
      </div>
      <CaptainTripControls
        tripId={trip.id}
        status={trip.status}
        seats={manifest.reduce((s, m) => s + m.seats, 0)}
        capacity={trip.vessel?.passenger_capacity ?? null}
        lifejackets={trip.lifejackets_confirmed}
        currency={trip.currency}
        namesRequired={namesRequired}
        passengers={manifest.map((m) => ({ id: m.id, name: m.full_name, seats: m.seats, amendment: m.is_amendment }))}
      />
    </div>
  );
}
