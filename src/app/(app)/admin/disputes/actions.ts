"use server";

import { revalidatePath } from "next/cache";
import { requireMe } from "@/server/auth/session";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { resolveDispute } from "@/server/services/escrow";

export type ResolveState = { error?: ErrorCode; ok?: boolean };

export async function resolveDisputeAction(_: ResolveState, formData: FormData): Promise<ResolveState> {
  const { me } = await requireMe("/admin/disputes");
  const action = String(formData.get("action")) as "release" | "refund" | "split";
  const share = String(formData.get("ownerShareMinor") ?? "");
  try {
    await resolveDispute(
      me,
      String(formData.get("holdId")),
      action,
      action === "split" && /^\d+$/.test(share) ? BigInt(share) : undefined,
    );
  } catch (err) {
    return { error: err instanceof ServiceError ? err.code : "unknown" };
  }
  revalidatePath("/admin/disputes");
  return { ok: true };
}
