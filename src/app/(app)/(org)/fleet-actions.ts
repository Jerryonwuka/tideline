"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  assignCrewSchema,
  confirmDocumentSchema,
  createDocumentSchema,
  crewInputSchema,
  uploadUrlSchema,
  vesselInputSchema,
} from "@/lib/schemas/fleet";
import { requireOrgContext, safeNext } from "@/server/auth/session";
import { sendInvitation } from "@/server/invites";
import { createCrewMember } from "@/server/services/crew";
import { confirmDocument, createDocument, createUploadUrl } from "@/server/services/documents";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { getOrg } from "@/server/services/orgs";
import { assignCrew, createVessel, deleteVessel, endAssignment, updateVessel } from "@/server/services/vessels";

export type FleetState = { error?: ErrorCode; fields?: Record<string, string>; ok?: boolean };
const code = (err: unknown): ErrorCode => (err instanceof ServiceError ? err.code : "unknown");

function vesselFromForm(formData: FormData) {
  const modes = formData.getAll("modes");
  const raw = Object.fromEntries(
    [
      "name",
      "type",
      "registrationNo",
      "imo",
      "mmsi",
      "yearBuilt",
      "lengthM",
      "passengerCapacity",
      "cargoCapacityT",
      "engine",
    ].map((k) => [k, formData.get(k) || undefined]),
  );
  return vesselInputSchema.safeParse({
    ...raw,
    ferryEnabled: modes.includes("ferry"),
    charterEnabled: modes.includes("charter"),
  });
}

export async function saveVesselAction(_: FleetState, formData: FormData): Promise<FleetState> {
  const { db, membership } = await requireOrgContext("/vessels");
  const parsed = vesselFromForm(formData);
  if (!parsed.success) {
    return {
      error: "validation",
      fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.code])),
    };
  }
  const id = z.uuid().safeParse(formData.get("id"));
  let vesselId: string;
  try {
    if (id.success) {
      vesselId = (await updateVessel(db, id.data, parsed.data)).id;
    } else {
      const org = await getOrg(db, membership.orgId);
      vesselId = (await createVessel(db, membership.orgId, org.country_code, parsed.data)).id;
    }
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/vessels");
  const next = safeNext(String(formData.get("next") ?? ""));
  redirect(next ? next.replace("{id}", vesselId) : `/vessels/${vesselId}`);
}

export async function deleteVesselAction(formData: FormData): Promise<void> {
  const { db } = await requireOrgContext("/vessels");
  const id = z.uuid().parse(formData.get("id"));
  await deleteVessel(db, id);
  revalidatePath("/vessels");
  redirect("/vessels");
}

export async function saveCrewAction(_: FleetState, formData: FormData): Promise<FleetState> {
  const { db, membership } = await requireOrgContext("/crew");
  const parsed = crewInputSchema.safeParse({
    fullName: formData.get("fullName"),
    crewRole: formData.get("crewRole"),
    phone: formData.get("phone") || undefined,
    emergencyContactName: formData.get("emergencyContactName") || undefined,
    emergencyContactPhone: formData.get("emergencyContactPhone") || undefined,
  });
  if (!parsed.success) return { error: "validation" };
  const invite = formData.get("invite") === "on";
  let crewId: string;
  try {
    const org = await getOrg(db, membership.orgId);
    const member = await createCrewMember(db, membership.orgId, org.country_code, parsed.data);
    crewId = member.id;
    // Captains and crew who use the app get an invitation; their record links when they accept.
    if (invite && member.phone_e164) {
      await sendInvitation(db, membership.orgId, {
        phone: member.phone_e164,
        role: parsed.data.crewRole === "captain" ? "captain" : "crew",
      });
    }
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/crew");
  const next = safeNext(String(formData.get("next") ?? ""));
  redirect(next ?? `/crew/${crewId}`);
}

export async function assignCrewAction(_: FleetState, formData: FormData): Promise<FleetState> {
  const { db, membership } = await requireOrgContext("/vessels");
  const vesselId = z.uuid().safeParse(formData.get("vesselId"));
  const parsed = assignCrewSchema.safeParse({ crewMemberId: formData.get("crewMemberId") });
  if (!vesselId.success || !parsed.success) return { error: "validation" };
  try {
    await assignCrew(db, membership.orgId, vesselId.data, parsed.data.crewMemberId);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/vessels/${vesselId.data}`);
  return { ok: true };
}

export async function endAssignmentAction(formData: FormData): Promise<void> {
  const { db } = await requireOrgContext("/vessels");
  await endAssignment(db, z.uuid().parse(formData.get("assignmentId")));
  revalidatePath(`/vessels/${z.uuid().parse(formData.get("vesselId"))}`);
}

/** Step 1 of an upload: a single-use signed URL for the browser to send the (compressed) file to. */
export async function uploadUrlAction(input: z.input<typeof uploadUrlSchema>) {
  const { db, membership } = await requireOrgContext("/documents");
  const parsed = uploadUrlSchema.parse(input);
  if (parsed.orgId !== membership.orgId) throw new ServiceError("forbidden");
  return createUploadUrl(db, parsed.orgId, parsed.subjectType, parsed.subjectId, parsed.contentType);
}

/** Step 2: record the document against its subject. */
export async function createDocumentAction(
  input: z.input<typeof createDocumentSchema> & { next?: string },
): Promise<FleetState & { id?: string }> {
  const { db, me } = await requireOrgContext("/documents");
  const parsed = createDocumentSchema.safeParse(input);
  if (!parsed.success) return { error: "validation" };
  try {
    const id = await createDocument(db, me.userId, parsed.data);
    revalidatePath("/documents");
    revalidatePath(`/vessels/${parsed.data.subjectId}`);
    return { ok: true, id };
  } catch (err) {
    return { error: code(err), fields: err instanceof ServiceError ? err.fields : undefined };
  }
}

export async function confirmDocumentAction(_: FleetState, formData: FormData): Promise<FleetState> {
  const { db, me } = await requireOrgContext("/documents");
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = confirmDocumentSchema.safeParse({
    number: formData.get("number") ?? undefined,
    issuer: formData.get("issuer") ?? undefined,
    issueDate: formData.get("issueDate") ?? undefined,
    expiryDate: formData.get("expiryDate") ?? undefined,
    reject: formData.get("decision") === "reject",
  });
  if (!id.success || !parsed.success) return { error: "validation" };
  try {
    await confirmDocument(db, me.userId, id.data, parsed.data);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/documents/${id.data}`);
  revalidatePath("/documents");
  return { ok: true };
}
