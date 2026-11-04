import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { invoiceInputSchema } from "@/lib/schemas/invoices";
import { parseJson, route } from "@/server/http";
import { fromDbError } from "@/server/services/errors";
import { createInvoice } from "@/server/services/invoices";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  const { org_id } = z.object({ org_id: uuid }).parse(Object.fromEntries(new URL(request.url).searchParams));
  const { data, error } = await (
    await supabaseForRequest(request)
  )
    .from("invoices")
    .select("id, number, bill_to, currency, total_minor, amount_paid_minor, due_date, status, charter_id, issue_date")
    .eq("org_id", org_id)
    .order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  return NextResponse.json(data);
});

/** New invoice (manual or from a charter); totals and VAT computed on the server. */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { org_id, ...input } = await parseJson(request, z.object({ org_id: uuid }).and(invoiceInputSchema));
  return NextResponse.json({ id: await createInvoice(db, org_id, input) }, { status: 201 });
});
