import "server-only";
import { devToolsEnabled } from "@/server/env";
import { integrations } from "@/server/integrations";
import { FakePaymentProvider } from "@/server/integrations/payments/fake";
import { handlePaymentWebhook } from "@/server/services/payments";
import { supabaseAdmin } from "@/server/supabase/admin";

/**
 * Local-only stand-in for a provider's checkout: marks the fake charge paid (or failed) and
 * delivers a signed charge webhook through the real webhook handler. Null when not available.
 */
export async function completeFakePayment(reference: string, outcome: "success" | "failed") {
  if (!devToolsEnabled()) return null;
  const { data: payment } = await supabaseAdmin()
    .from("payments")
    .select("provider, amount_minor, currency")
    .eq("provider_ref", reference)
    .maybeSingle();
  const provider = integrations().paymentProviders.find((p) => p.id === payment?.provider);
  if (!payment || !provider || !("completeCharge" in provider)) return null;
  (provider as FakePaymentProvider).completeCharge(reference, outcome);
  const webhook = FakePaymentProvider.signedWebhook({
    id: `evt_${reference}_${outcome}`,
    event: outcome === "success" ? "charge.success" : "charge.failed",
    reference,
    amount_minor: String(payment.amount_minor),
    currency: payment.currency,
  });
  const result = await handlePaymentWebhook(provider.id, webhook);
  return { ...result, webhook: { body: webhook.rawBody, signature: webhook.headers.get("x-fake-signature") ?? "" } };
}
