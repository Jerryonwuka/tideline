import { NextResponse } from "next/server";
import { toJson } from "@/lib/money";
import { subscribeSchema } from "@/lib/schemas/tickets";
import { parseJson, requireUuid, route } from "@/server/http";
import { NoPaymentRouteError } from "@/server/integrations/payments/router";
import { ServiceError } from "@/server/services/errors";
import { billingOverview, startSubscriptionCheckout } from "@/server/services/payments";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Plans priced in the org's currency, its subscriptions and whether it's read-only. */
export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const o = await billingOverview(await supabaseForRequest(request), id);
  return NextResponse.json({
    ...o,
    plans: o.plans.map((p) => ({ ...p, unitPrice: toJson(p.unitPrice), periodPrice: toJson(p.periodPrice) })),
    subscriptions: o.subscriptions.map((s) => ({ ...s, amount_minor: String(s.amount_minor) })),
  });
});

/** Owner pays the next billing period of a plan; returns the checkout URL. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const { planCode } = await parseJson(request, subscribeSchema);
  try {
    return NextResponse.json(await startSubscriptionCheckout(db, me, id, planCode), { status: 201 });
  } catch (err) {
    if (err instanceof NoPaymentRouteError) throw new ServiceError("payments_unavailable");
    throw err;
  }
});
