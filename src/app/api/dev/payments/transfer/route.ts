import { NextResponse } from "next/server";
import { z } from "zod";
import { devToolsEnabled } from "@/server/env";
import { FakePaymentProvider } from "@/server/integrations/payments/fake";
import { handlePaymentWebhook } from "@/server/services/payments";
import { supabaseAdmin } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

/** Local-only: the provider reports a payout transfer's outcome (signed webhook through the real handler). */
export async function POST(request: Request) {
  if (!devToolsEnabled()) return new NextResponse(null, { status: 404 });
  const { ref, outcome } = z
    .object({ ref: z.string().min(4), outcome: z.enum(["success", "failed", "reversed"]).default("success") })
    .parse(await request.json());
  const { data: p } = await supabaseAdmin()
    .from("payouts")
    .select("amount_minor, currency")
    .eq("provider_transfer_ref", ref)
    .maybeSingle();
  if (!p) return new NextResponse(null, { status: 404 });
  const webhook = FakePaymentProvider.signedWebhook({
    id: `evt_${ref}_${outcome}`,
    event: `transfer.${outcome}`,
    reference: ref,
    amount_minor: String(p.amount_minor),
    currency: p.currency,
  });
  return NextResponse.json(await handlePaymentWebhook("paystack", webhook));
}
