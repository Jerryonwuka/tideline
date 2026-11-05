"use server";

import { redirect } from "next/navigation";
import { otpSendSchema, otpVerifySchema } from "@/lib/schemas/auth";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { sendOtp, verifyOtp } from "@/server/services/auth";
import { getMe } from "@/server/services/profile";
import { supabaseServer } from "@/server/supabase/server";
import { postLoginPath, safeNext, setActiveOrg } from "./session";

export type ActionResult = { ok?: true; error?: ErrorCode; phone?: string };

function errorCode(err: unknown): ErrorCode {
  return err instanceof ServiceError ? err.code : "unknown";
}

export async function sendCodeAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = otpSendSchema.safeParse({ phone: formData.get("phone") });
  if (!parsed.success) return { error: "invalid_phone" };
  try {
    const { phone } = await sendOtp(await supabaseServer(), parsed.data.phone);
    return { ok: true, phone };
  } catch (err) {
    return { error: errorCode(err) };
  }
}

export async function verifyCodeAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = otpVerifySchema.safeParse({ phone: formData.get("phone"), code: formData.get("code") });
  if (!parsed.success) return { error: "invalid_code", phone: String(formData.get("phone") ?? "") };
  let destination: string;
  try {
    const db = await supabaseServer();
    await verifyOtp(db, parsed.data.phone, parsed.data.code);
    const me = await getMe(db);
    if (!me) return { error: "not_authenticated" };
    const first = me.memberships.find((m) => m.status === "active");
    if (first) await setActiveOrg(first.orgId);
    destination = postLoginPath(me, safeNext(String(formData.get("next") ?? "")));
  } catch (err) {
    return { error: errorCode(err), phone: parsed.data.phone };
  }
  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect("/");
}
