import { NextResponse } from "next/server";
import { sendInvoiceSchema } from "@/lib/schemas/invoices";
import { toE164 } from "@/lib/phone";
import { parseJson, requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { sendInvoice } from "@/server/services/invoices";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Stores the PDF, marks the invoice sent, and sends it by WhatsApp and/or email. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const input = await parseJson(request, sendInvoiceSchema);
  const { data: inv } = await db.from("invoices").select("org:orgs(country_code)").eq("id", id).maybeSingle();
  const whatsapp = input.whatsapp ? toE164(input.whatsapp, inv?.org?.country_code ?? "") : undefined;
  if (input.whatsapp && !whatsapp) throw new ServiceError("invalid_phone");
  return NextResponse.json(await sendInvoice(db, id, { whatsapp: whatsapp ?? undefined, email: input.email }));
});
