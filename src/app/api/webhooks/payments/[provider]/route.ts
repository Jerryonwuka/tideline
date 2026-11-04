import { NextResponse } from "next/server";
import { reportError } from "@/server/log";
import { WEBHOOK_SIGNATURE_ERROR } from "@/server/integrations/payments/types";
import { ServiceError } from "@/server/services/errors";
import { handlePaymentWebhook } from "@/server/services/payments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ provider: string }> };

/**
 * Provider webhooks (e.g. /api/webhooks/payments/paystack). Signature-checked by the adapter;
 * each event id is applied once. 200 for duplicates so providers stop retrying.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { provider } = await params;
  const rawBody = await request.text();
  try {
    const result = await handlePaymentWebhook(provider, { rawBody, headers: request.headers });
    return NextResponse.json(result);
  } catch (err) {
    // By name, not instanceof: in dev each bundle can hold its own copy of the class.
    if (err instanceof Error && err.name === WEBHOOK_SIGNATURE_ERROR)
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    if (err instanceof ServiceError && err.code === "not_found") return new NextResponse(null, { status: 404 });
    await reportError("webhook.payment", err, { provider });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
