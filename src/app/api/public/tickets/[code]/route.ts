import { NextResponse } from "next/server";
import { ticketCodeSchema } from "@/lib/schemas/tickets";
import { route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { confirmByVerify, ticketByCode } from "@/server/services/payments";

type Ctx = { params: Promise<{ code: string }> };

/** Public: a ticket by its code. A reserved ticket is checked with the provider first. */
export const GET = route<Ctx>(async (_request, { params }) => {
  const code = ticketCodeSchema.parse((await params).code);
  let ticket = await ticketByCode(code);
  if (!ticket) throw new ServiceError("ticket_not_found");
  const payment = Array.isArray(ticket.payment) ? ticket.payment[0] : ticket.payment;
  if (ticket.status === "reserved" && payment?.status === "initiated") {
    await confirmByVerify(payment.provider_ref);
    ticket = (await ticketByCode(code))!;
  }
  return NextResponse.json({
    code: ticket.code,
    status: ticket.status,
    qty: ticket.qty,
    name: ticket.buyer_name,
    total: { amount_minor: String(ticket.total_minor), currency: ticket.currency },
  });
});
