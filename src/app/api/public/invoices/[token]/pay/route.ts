import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { NoPaymentRouteError } from "@/server/integrations/payments/router";
import { ServiceError } from "@/server/services/errors";
import { startInvoiceCheckout } from "@/server/services/invoices";

type Ctx = { params: Promise<{ token: string }> };

/** Public: start paying the outstanding amount; returns the provider's checkout URL. */
export const POST = route<Ctx>(async (_request, { params }) => {
  try {
    return NextResponse.json({ checkoutUrl: await startInvoiceCheckout((await params).token) });
  } catch (err) {
    if (err instanceof NoPaymentRouteError) throw new ServiceError("payments_unavailable");
    throw err;
  }
});
