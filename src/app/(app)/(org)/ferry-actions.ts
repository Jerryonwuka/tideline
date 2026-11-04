"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  adHocTripSchema,
  manifestEntrySchema,
  proposeJettySchema,
  routeInputSchema,
  scheduleInputSchema,
} from "@/lib/schemas/ferry";
import { requireOrgContext } from "@/server/auth/session";
import { myCrewId, orgBasics } from "@/server/org-context";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import {
  addManifestEntry,
  arrive,
  cancelTrip,
  createAdHocTrip,
  createRoute,
  createSchedule,
  depart,
  getTrip,
  proposeJetty,
  removeManifestEntry,
  setLifejackets,
  setRouteActive,
  startBoarding,
} from "@/server/services/ferry";

export type FerryState = { error?: ErrorCode; ok?: boolean };
const code = (err: unknown): ErrorCode => (err instanceof ServiceError ? err.code : "unknown");

async function guard(fn: () => Promise<unknown>, paths: string[]): Promise<FerryState> {
  try {
    await fn();
  } catch (err) {
    return { error: code(err) };
  }
  paths.forEach((p) => revalidatePath(p));
  return { ok: true };
}

export async function createRouteAction(_: FerryState, formData: FormData): Promise<FerryState> {
  const { db, membership } = await requireOrgContext("/routes");
  const parsed = routeInputSchema.safeParse({
    originJettyId: formData.get("originJettyId"),
    destinationJettyId: formData.get("destinationJettyId"),
    durationMin: formData.get("durationMin"),
    baseFare: formData.get("baseFare"),
  });
  if (!parsed.success) return { error: "validation" };
  const org = await orgBasics(db, membership.orgId);
  return guard(() => createRoute(db, membership.orgId, org.currency, parsed.data), ["/routes"]);
}

export async function toggleRouteAction(formData: FormData): Promise<void> {
  const { db } = await requireOrgContext("/routes");
  await setRouteActive(db, z.uuid().parse(formData.get("routeId")), formData.get("active") === "true");
  revalidatePath("/routes");
}

export async function createScheduleAction(_: FerryState, formData: FormData): Promise<FerryState> {
  const { db, membership } = await requireOrgContext("/routes");
  const parsed = scheduleInputSchema.safeParse({
    routeId: formData.get("routeId"),
    vesselId: formData.get("vesselId"),
    daysOfWeek: formData.getAll("days"),
    departureTime: formData.get("departureTime"),
  });
  if (!parsed.success) return { error: "validation" };
  return guard(() => createSchedule(db, membership.orgId, parsed.data), ["/routes"]);
}

export async function proposeJettyAction(_: FerryState, formData: FormData): Promise<FerryState> {
  const { db, membership } = await requireOrgContext("/routes");
  const parsed = proposeJettySchema.safeParse({
    orgId: membership.orgId,
    name: formData.get("name"),
    aliases: String(formData.get("aliases") ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
  });
  if (!parsed.success) return { error: "validation" };
  const { orgId, ...input } = parsed.data;
  return guard(() => proposeJetty(db, orgId, input), ["/routes"]);
}

export async function startAdHocTripAction(_: FerryState, formData: FormData): Promise<FerryState> {
  const { db, me, membership } = await requireOrgContext("/captain");
  const parsed = adHocTripSchema.safeParse({
    vesselId: formData.get("vesselId"),
    routeId: formData.get("routeId") || undefined,
    originText: formData.get("originText") || undefined,
    destinationText: formData.get("destinationText") || undefined,
    clientId: formData.get("clientId") || undefined,
  });
  if (!parsed.success) return { error: "validation" };
  let id: string;
  try {
    const org = await orgBasics(db, membership.orgId);
    id = await createAdHocTrip(
      db,
      membership.orgId,
      org.currency,
      await myCrewId(db, membership.orgId, me.userId),
      parsed.data,
    );
  } catch (err) {
    return { error: code(err) };
  }
  redirect(`/captain/trips/${id}`);
}

const tripPaths = (id: string) => [`/captain/trips/${id}`, "/captain", `/trips/${id}`, "/trips", "/reports/daily"];

export async function tripStepAction(_: FerryState, formData: FormData): Promise<FerryState> {
  const { db } = await requireOrgContext("/captain");
  const id = z.uuid().parse(formData.get("tripId"));
  const step = String(formData.get("step"));
  return guard(async () => {
    if (step === "boarding") await startBoarding(db, id);
    else if (step === "lifejackets") await setLifejackets(db, id, formData.get("confirmed") === "true");
    else if (step === "depart") await depart(db, id);
    else if (step === "arrive") {
      const trip = await getTrip(db, id);
      const cash = String(formData.get("cash") ?? "").trim();
      await arrive(db, id, trip.currency, cash || undefined);
    } else if (step === "cancel") await cancelTrip(db, id);
    else throw new ServiceError("validation");
  }, tripPaths(id));
}

export async function addPassengerAction(_: FerryState, formData: FormData): Promise<FerryState> {
  const { db } = await requireOrgContext("/captain");
  const tripId = z.uuid().parse(formData.get("tripId"));
  const parsed = manifestEntrySchema.safeParse({
    fullName: formData.get("fullName") || undefined,
    phone: formData.get("phone") || undefined,
    seats: formData.get("seats") || 1,
    clientId: formData.get("clientId") || undefined,
  });
  if (!parsed.success) return { error: "validation" };
  return guard(async () => {
    const trip = await getTrip(db, tripId);
    const org = await orgBasics(db, trip.org_id);
    const requireNames =
      (org.settings as { require_passenger_names?: boolean } | null)?.require_passenger_names ?? true;
    if (requireNames && !parsed.data.fullName) throw new ServiceError("validation");
    await addManifestEntry(db, trip.org_id, tripId, org.country_code, parsed.data);
  }, tripPaths(tripId));
}

export async function removePassengerAction(formData: FormData): Promise<void> {
  const { db } = await requireOrgContext("/captain");
  const tripId = z.uuid().parse(formData.get("tripId"));
  await removeManifestEntry(db, z.uuid().parse(formData.get("entryId"))).catch(() => undefined);
  tripPaths(tripId).forEach((p) => revalidatePath(p));
}
