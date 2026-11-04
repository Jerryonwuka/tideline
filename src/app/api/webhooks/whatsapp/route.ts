import { NextResponse } from "next/server";
import { handleInbound } from "@/server/bot/handle";
import { inboundSecrets } from "@/server/env";
import {
  parseWhatsAppPayload,
  verifyWhatsAppSignature,
  whatsAppChallenge,
} from "@/server/integrations/messaging/inbound";

export const dynamic = "force-dynamic";

/** Meta's subscription handshake. */
export function GET(request: Request) {
  const challenge = whatsAppChallenge(new URL(request.url).searchParams, inboundSecrets().whatsAppVerifyToken);
  return challenge ? new NextResponse(challenge, { status: 200 }) : new NextResponse(null, { status: 403 });
}

/** WhatsApp Cloud API messages: signature checked, each message handled once (wa_message_id). */
export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), inboundSecrets().whatsAppSecret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let messages;
  try {
    messages = parseWhatsAppPayload(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const outcomes = [];
  for (const m of messages) outcomes.push(await handleInbound(m));
  return NextResponse.json({ outcomes });
}
