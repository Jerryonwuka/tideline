import { NextResponse } from "next/server";
import { devToolsEnabled } from "@/server/env";
import { integrations } from "@/server/integrations";
import type { FakeMessagingClient } from "@/server/integrations/messaging/fake";

export const dynamic = "force-dynamic";

/**
 * Local-only: what the fake messaging client "sent" to a phone (OTP codes and messages), so the
 * e2e tests can sign in and follow invite links. 404 anywhere except APP_ENV=local with fakes.
 */
export function GET(request: Request) {
  // Shape check, not instanceof: in dev each route bundle can hold its own copy of the class.
  const candidate = devToolsEnabled() ? integrations().messaging : null;
  if (!candidate || !("otps" in candidate) || !("sent" in candidate)) return new NextResponse(null, { status: 404 });
  const messaging = candidate as FakeMessagingClient;
  const phone = new URL(request.url).searchParams.get("phone");
  if (!phone)
    return NextResponse.json({ error: { code: "validation", message: "phone is required" } }, { status: 422 });
  return NextResponse.json({
    otps: messaging.otps.filter((o) => o.toE164 === phone).map((o) => o.code),
    messages: messaging.sent
      .filter((m) => m.toE164 === phone)
      .map((m) =>
        "text" in m
          ? { channel: m.channel, text: m.text }
          : "body" in m
            ? { channel: m.channel, text: m.body, buttons: m.buttons }
            : { channel: m.channel, params: "params" in m ? m.params : [] },
      ),
  });
}
