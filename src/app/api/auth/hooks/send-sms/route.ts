import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/server/env";
import { integrations } from "@/server/integrations";
import { hashPhone } from "@/server/privacy";
import { verifyStandardWebhook } from "@/server/webhooks/standard";

const payloadSchema = z.object({
  user: z.object({ phone: z.string().min(6), user_metadata: z.record(z.string(), z.unknown()).optional() }),
  sms: z.object({ otp: z.string().regex(/^\d{4,10}$/) }),
});

/**
 * Supabase Auth "send SMS" hook: Auth generates the code, we deliver it through MessagingClient
 * (Termii in production, the fake locally). Signed with Standard Webhooks.
 */
export async function POST(request: Request) {
  const secret = serverEnv().SEND_SMS_HOOK_SECRET;
  const rawBody = await request.text();
  if (!secret || !verifyStandardWebhook(secret, request.headers, rawBody)) {
    return NextResponse.json({ error: { http_code: 401, message: "Invalid signature" } }, { status: 401 });
  }
  const parsed = payloadSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    return NextResponse.json({ error: { http_code: 400, message: "Invalid payload" } }, { status: 400 });
  }
  const phone = `+${parsed.data.user.phone.replace(/^\+/, "")}`;
  const locale =
    typeof parsed.data.user.user_metadata?.locale === "string" ? parsed.data.user.user_metadata.locale : "en";
  const result = await integrations().messaging.sendOtp(phone, parsed.data.sms.otp, locale);
  if (result.status !== "accepted") {
    console.error(`[send-sms] delivery failed for phone#${hashPhone(phone)}`);
    return NextResponse.json({ error: { http_code: 502, message: "Delivery failed" } }, { status: 502 });
  }
  return NextResponse.json({});
}
