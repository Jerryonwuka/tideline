"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMe } from "@/server/auth/session";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { recordConsent, requestData } from "@/server/services/privacy";

export type PrivacyState = { error?: ErrorCode; ok?: "export" | "delete" | "consent" };
const code = (err: unknown): ErrorCode => (err instanceof ServiceError ? err.code : "unknown");

export async function marketingAction(_: PrivacyState, formData: FormData): Promise<PrivacyState> {
  const { me } = await requireMe("/settings/privacy");
  await recordConsent({ userId: me.userId }, "marketing", formData.get("granted") === "on", "settings");
  revalidatePath("/settings/privacy");
  return { ok: "consent" };
}

export async function dataRequestAction(_: PrivacyState, formData: FormData): Promise<PrivacyState> {
  const { db, me } = await requireMe("/settings/privacy");
  const kind = formData.get("kind") === "delete" ? "delete" : "export";
  if (kind === "delete" && formData.get("confirm") !== "on") return { error: "validation" };
  try {
    await requestData(db, me, kind);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/settings/privacy");
  return { ok: kind };
}

/** Ends every session for this account (all devices), then back to sign-in. */
export async function signOutEverywhereAction(): Promise<void> {
  const { db } = await requireMe("/settings/privacy");
  await db.auth.signOut({ scope: "global" });
  redirect("/login");
}
