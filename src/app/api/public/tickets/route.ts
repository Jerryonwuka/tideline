import { NextResponse } from "next/server";
import { ticketPurchaseSchema } from "@/lib/schemas/tickets";
import { parseJson, route } from "@/server/http";
import { NoPaymentRouteError } from "@/server/integrations/payments/router";
import { ServiceError } from "@/server/services/errors";
import { startTicketCheckout } from "@/server/services/payments";

/** Public: hold seats and start checkout. Pay at the returned URL; the ticket is paid on confirmation. */
export const POST = route(async (request) => {
  const input = await parseJson(request, ticketPurchaseSchema);
  try {
    return NextResponse.json(await startTicketCheckout(input), { status: 201 });
  } catch (err) {
    if (err instanceof NoPaymentRouteError) throw new ServiceError("payments_unavailable");
    throw err;
  }
});
