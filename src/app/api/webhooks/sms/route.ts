import { NextResponse } from "next/server";
import { handleInbound } from "@/server/bot/handle";
import { inboundSecrets } from "@/server/env";
import { parseSmsPayload } from "@/server/integrations/messaging/inbound";

export const dynamic = "force-dynamic";

/** Inbound SMS (Termii) for captains with no data: same bot, replies by SMS (§8 SMS fallback). */
export async function POST(request: Request) {
  let message;
  try {
    message = parseSmsPayload(await request.json(), new URL(request.url).searchParams, inboundSecrets().smsToken);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!message.providerId || !message.text) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  return NextResponse.json({ outcome: await handleInbound(message) });
}
