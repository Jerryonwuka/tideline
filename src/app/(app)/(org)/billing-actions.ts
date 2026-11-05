"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { agentSaleSchema } from "@/lib/schemas/tickets";
import { requireOrgContext } from "@/server/auth/session";
import { NoPaymentRouteError } from "@/server/integrations/payments/router";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { recordAgentSale, startSubscriptionCheckout } from "@/server/services/payments";

export type SaleState = { error?: ErrorCode; code?: string };

const code = (err: unknown): ErrorCode =>
  err instanceof ServiceError ? err.code : err instanceof NoPaymentRouteError ? "payments_unavailable" : "unknown";

export async function subscribeAction(formData: FormData): Promise<void> {
  const { db, me, membership } = await requireOrgContext("/billing");
  let url: string;
  try {
    url = (await startSubscriptionCheckout(db, me, membership.orgId, String(formData.get("planCode")))).checkoutUrl;
  } catch (err) {
    redirect(`/billing?error=${code(err)}`);
  }
  redirect(url);
}

export async function agentSaleAction(_: SaleState, formData: FormData): Promise<SaleState> {
  const tripId = String(formData.get("tripId") ?? "");
  const { db, me } = await requireOrgContext(`/trips/${tripId}`);
  const parsed = agentSaleSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    qty: formData.get("qty"),
    method: formData.get("method"),
  });
  if (!parsed.success) return { error: "validation" };
  try {
    const ticket = await recordAgentSale(db, me, { ...parsed.data, tripId });
    revalidatePath(`/trips/${tripId}`);
    return { code: ticket };
  } catch (err) {
    return { error: code(err) };
  }
}
