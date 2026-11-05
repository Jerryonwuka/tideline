import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { NoPaymentRouteError } from "@/server/integrations/payments/router";
import { ServiceError } from "@/server/services/errors";
import { startEscrowCheckout } from "@/server/services/escrow";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Charterer pays the charter's value into escrow; returns the provider checkout URL. */
export const POST = route<Ctx>(async (request, { params }) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  try {
    return NextResponse.json(
      { checkoutUrl: await startEscrowCheckout(db, me, requireUuid((await params).id)) },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof NoPaymentRouteError) throw new ServiceError("payments_unavailable");
    throw err;
  }
});
