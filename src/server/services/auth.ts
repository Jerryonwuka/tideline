import "server-only";
import { platformConfig } from "@/config/platform";
import { toE164 } from "@/lib/phone";
import type { Db } from "@/server/supabase/server";
import { ServiceError } from "./errors";

export function normalisePhone(input: string): string {
  const e164 = toE164(input, platformConfig.defaultPhoneCountry);
  if (!e164) throw new ServiceError("invalid_phone");
  return e164;
}

/** Asks Supabase Auth for a one-time code; it is delivered through our send-SMS hook. */
export async function sendOtp(db: Db, phoneInput: string): Promise<{ phone: string }> {
  const phone = normalisePhone(phoneInput);
  const { error } = await db.auth.signInWithOtp({ phone });
  if (error) throw new ServiceError(error.status === 429 ? "rate_limited" : "delivery_failed");
  return { phone };
}

export async function verifyOtp(db: Db, phoneInput: string, code: string) {
  const phone = normalisePhone(phoneInput);
  const { data, error } = await db.auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error || !data.session) throw new ServiceError(error?.status === 429 ? "rate_limited" : "invalid_code");
  return { session: data.session, userId: data.session.user.id };
}
