import { NextResponse } from "next/server";
import { z } from "zod";
import { devToolsEnabled } from "@/server/env";
import { integrations } from "@/server/integrations";
import type { FakeMessagingClient } from "@/server/integrations/messaging/fake";
import type { FakeSttClient } from "@/server/integrations/stt/fake";

export const dynamic = "force-dynamic";

/**
 * Local-only: make a WhatsApp media id downloadable from the fake client, optionally with the
 * transcript the fake speech-to-text should return for it. 404 elsewhere.
 */
export async function POST(request: Request) {
  const { messaging, stt } = integrations();
  if (!devToolsEnabled() || !("putMedia" in messaging) || !("register" in stt))
    return new NextResponse(null, { status: 404 });
  const body = z
    .object({
      mediaId: z.string().min(1),
      mimeType: z.string().min(3),
      base64: z.string().min(1),
      transcript: z.string().optional(),
    })
    .parse(await request.json());
  const bytes = new Uint8Array(Buffer.from(body.base64, "base64"));
  (messaging as FakeMessagingClient).putMedia(body.mediaId, { bytes, mimeType: body.mimeType });
  if (body.transcript) (stt as FakeSttClient).register(bytes, body.transcript);
  return NextResponse.json({ ok: true });
}
