"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { proposeJettySchema, routeInputSchema, scheduleInputSchema } from "@/lib/schemas/ferry";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { createRoute, createSchedule, proposeJetty, setRouteActive } from "@/server/services/ferry";

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
