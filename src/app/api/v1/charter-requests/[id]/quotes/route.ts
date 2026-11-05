import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { quoteInputSchema } from "@/lib/schemas/charter";
import { parseJson, requireUuid, route } from "@/server/http";
import { orgBasics } from "@/server/org-context";
import { sendQuote } from "@/server/services/charter";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** The owner's quote: day rate, mobilisation, fuel and payment terms, valid until. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const { org_id, ...input } = await parseJson(request, z.object({ org_id: uuid }).and(quoteInputSchema));
  const org = await orgBasics(db, org_id);
  return NextResponse.json({ id: await sendQuote(db, org_id, org.currency, id, input) }, { status: 201 });
});
