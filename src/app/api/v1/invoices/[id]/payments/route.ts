import { NextResponse } from "next/server";
import { recordPaymentSchema } from "@/lib/schemas/invoices";
import { parseJson, requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { recordInvoicePayment } from "@/server/services/invoices";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Record a payment received outside the platform (cash or bank transfer). */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const { amount, method } = await parseJson(request, recordPaymentSchema);
  await recordInvoicePayment(db, me, id, amount, method);
  return NextResponse.json({ ok: true }, { status: 201 });
});
