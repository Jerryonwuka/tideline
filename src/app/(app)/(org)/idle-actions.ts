"use server";

import { revalidatePath } from "next/cache";
import { fromMajor } from "@/lib/money";
import { outreachSchema, publishSuggestionSchema } from "@/lib/schemas/idle";
import { requireOrgContext } from "@/server/auth/session";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { draftOutreach, publishSuggestion, suggestionFor } from "@/server/services/idle";

export type IdleState = { error?: ErrorCode; ok?: boolean; text?: string; listingId?: string };
const code = (err: unknown): ErrorCode => (err instanceof ServiceError ? err.code : "unknown");

export async function publishAction(_: IdleState, formData: FormData): Promise<IdleState> {
  const vesselId = String(formData.get("vesselId"));
  const { db } = await requireOrgContext("/charters/idle");
  const parsed = publishSuggestionSchema.safeParse({
    dayRate: formData.get("dayRate") || undefined,
    area: formData.get("area") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { error: "validation" };
  try {
    const s = await suggestionFor(db, vesselId);
    if (!s) return { error: "not_found" };
    const listingId = await publishSuggestion(db, vesselId, {
      rateMinor: parsed.data.dayRate ? fromMajor(parsed.data.dayRate, s.currency).amountMinor : undefined,
      area: parsed.data.area,
      description: parsed.data.description,
    });
    revalidatePath("/charters/idle");
    return { ok: true, listingId };
  } catch (err) {
    return { error: code(err) };
  }
}

export async function outreachAction(_: IdleState, formData: FormData): Promise<IdleState> {
  const { db } = await requireOrgContext("/charters/idle");
  const parsed = outreachSchema.safeParse({ buyerOrgId: formData.get("buyerOrgId") });
  if (!parsed.success) return { error: "validation" };
  try {
    return { text: await draftOutreach(db, String(formData.get("vesselId")), parsed.data.buyerOrgId) };
  } catch (err) {
    return { error: code(err) };
  }
}
