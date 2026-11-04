"use server";

import { redirect } from "next/navigation";
import { recordConsent } from "@/server/services/privacy";
import { createOrgSchema } from "@/lib/schemas/orgs";
import { updateProfileSchema } from "@/lib/schemas/profile";
import { safeNext, setActiveOrg } from "@/server/auth/session";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { createOrg } from "@/server/services/orgs";
import { getMe, updateMe } from "@/server/services/profile";
import { supabaseServer } from "@/server/supabase/server";

export type FormState = { error?: ErrorCode; fields?: Record<string, string> };

export async function saveProfileAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateProfileSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success || !parsed.data.fullName) return { error: "invalid_name" };
  const db = await supabaseServer();
  const me = await getMe(db);
  if (!me) redirect("/login");
  try {
    await updateMe(db, me.userId, parsed.data);
    await recordConsent({ userId: me.userId }, "privacy_notice", true, "sign_up");
  } catch (err) {
    return { error: err instanceof ServiceError ? err.code : "unknown" };
  }
  const next = safeNext(String(formData.get("next") ?? ""));
  redirect(next ?? (me.memberships.some((m) => m.status === "active") ? "/dashboard" : "/onboarding"));
}

export async function createOrgAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = createOrgSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    countryCode: formData.get("countryCode"),
    modes: formData.getAll("modes"),
    registrationNumber: formData.get("registrationNumber") ?? undefined,
    region: formData.get("region") ?? undefined,
  });
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.code]));
    return { error: fields.modes ? "invalid_modes" : fields.name ? "invalid_name" : "validation", fields };
  }
  let orgId: string;
  try {
    orgId = await createOrg(await supabaseServer(), parsed.data);
  } catch (err) {
    return { error: err instanceof ServiceError ? err.code : "unknown" };
  }
  await setActiveOrg(orgId);
  // Charterers hire vessels rather than run them: straight to the board.
  redirect(parsed.data.type === "charterer" ? "/board" : "/onboarding/vessel");
}
