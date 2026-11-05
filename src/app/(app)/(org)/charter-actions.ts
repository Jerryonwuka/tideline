"use server";

import { revalidatePath } from "next/cache";
import { listingInputSchema, quoteInputSchema, requestInputSchema } from "@/lib/schemas/charter";
import { requireMe, requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { createRequest, decideQuote, saveListing, sendQuote } from "@/server/services/charter";
import { ServiceError, type ErrorCode } from "@/server/services/errors";

export type CharterState = { error?: ErrorCode; ok?: boolean };

const code = (err: unknown): ErrorCode => (err instanceof ServiceError ? err.code : "unknown");
const opt = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : String(v));

export async function saveListingAction(_: CharterState, formData: FormData): Promise<CharterState> {
  const { db, membership } = await requireOrgContext("/charters");
  const parsed = listingInputSchema.safeParse({
    vesselId: formData.get("vesselId"),
    dayRate: formData.get("dayRate"),
    minRate: opt(formData.get("minRate")),
    minDays: formData.get("minDays"),
    operatingArea: formData.get("operatingArea"),
    availableFrom: opt(formData.get("availableFrom")),
    availableTo: opt(formData.get("availableTo")),
    description: opt(formData.get("description")),
    status: formData.get("status"),
    publicDocumentIds: formData.getAll("publicDocumentIds"),
  });
  if (!parsed.success) return { error: "validation" };
  try {
    const org = await orgBasics(db, membership.orgId);
    await saveListing(db, membership.orgId, org.currency, parsed.data, opt(formData.get("id")));
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/charters");
  return { ok: true };
}

export async function createRequestAction(_: CharterState, formData: FormData): Promise<CharterState> {
  const { db, me } = await requireMe("/board");
  const parsed = requestInputSchema.safeParse({
    listingId: opt(formData.get("listingId")),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    location: formData.get("location"),
    purpose: formData.get("purpose"),
    crewNeeds: opt(formData.get("crewNeeds")),
    budget: opt(formData.get("budget")),
    currency: opt(formData.get("currency")),
  });
  if (!parsed.success) return { error: "validation" };
  try {
    await createRequest(db, me, String(formData.get("orgId")), parsed.data);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/charters/requests");
  return { ok: true };
}

export async function sendQuoteAction(_: CharterState, formData: FormData): Promise<CharterState> {
  const { db, membership } = await requireOrgContext("/charters/requests");
  const parsed = quoteInputSchema.safeParse({
    vesselId: formData.get("vesselId"),
    dayRate: formData.get("dayRate"),
    mobilisation: opt(formData.get("mobilisation")),
    fuelTerms: opt(formData.get("fuelTerms")),
    paymentTerms: opt(formData.get("paymentTerms")),
    validUntil: formData.get("validUntil"),
  });
  if (!parsed.success) return { error: "validation" };
  try {
    const org = await orgBasics(db, membership.orgId);
    await sendQuote(db, membership.orgId, org.currency, String(formData.get("requestId")), parsed.data);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/charters/requests");
  return { ok: true };
}

export async function decideQuoteAction(_: CharterState, formData: FormData): Promise<CharterState> {
  const { db } = await requireOrgContext("/charters/requests");
  try {
    await decideQuote(
      db,
      String(formData.get("quoteId")),
      formData.get("decision") === "accept" ? "accept" : "decline",
    );
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/charters/requests");
  return { ok: true };
}
