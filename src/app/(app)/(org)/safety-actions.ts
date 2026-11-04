"use server";

import { revalidatePath } from "next/cache";
import { overrideDecisionSchema, thresholdsInputSchema } from "@/lib/schemas/safety";
import { requireOrgContext } from "@/server/auth/session";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { decideOverride, saveThresholds } from "@/server/services/safety";

export type SafetyState = { error?: ErrorCode; ok?: boolean };

const code = (err: unknown): ErrorCode => (err instanceof ServiceError ? err.code : "unknown");

export async function saveThresholdsAction(_: SafetyState, formData: FormData): Promise<SafetyState> {
  const { db, membership } = await requireOrgContext("/safety");
  const parsed = thresholdsInputSchema.safeParse({
    maxWindKmh: formData.get("maxWindKmh"),
    maxGustKmh: formData.get("maxGustKmh"),
    maxWaveM: formData.get("maxWaveM"),
    maxPrecipMmH: formData.get("maxPrecipMmH"),
    nightBlock: formData.get("nightBlock") === "on",
    permittedStart: formData.get("permittedStart") || null,
    permittedEnd: formData.get("permittedEnd") || null,
  });
  if (!parsed.success) return { error: "validation" };
  try {
    await saveThresholds(db, membership.orgId, parsed.data);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/safety");
  return { ok: true };
}

export async function decideOverrideAction(_: SafetyState, formData: FormData): Promise<SafetyState> {
  const { db, me } = await requireOrgContext("/safety");
  const parsed = overrideDecisionSchema.safeParse({
    decision: formData.get("decision"),
    reason: formData.get("reason"),
  });
  const requestId = String(formData.get("requestId") ?? "");
  if (!parsed.success || !requestId) return { error: "validation" };
  try {
    await decideOverride(db, me, requestId, parsed.data.decision, parsed.data.reason);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/safety");
  return { ok: true };
}
