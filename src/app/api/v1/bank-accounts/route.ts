import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { bankAccountSchema } from "@/lib/schemas/escrow";
import { parseJson, route } from "@/server/http";
import { fromDbError, ServiceError } from "@/server/services/errors";
import { addBankAccount } from "@/server/services/escrow";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  const { org_id } = z.object({ org_id: uuid }).parse(Object.fromEntries(new URL(request.url).searchParams));
  const { data, error } = await (
    await supabaseForRequest(request)
  )
    .from("bank_accounts")
    .select("id, bank_code, account_number_last4, account_name, currency, verified, created_at")
    .eq("org_id", org_id);
  if (error) throw fromDbError(error);
  return NextResponse.json(data);
});

/** Owner adds a payout account; the provider resolves it. Only the last 4 digits are stored. */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const { org_id, ...input } = await parseJson(request, z.object({ org_id: uuid }).and(bankAccountSchema));
  return NextResponse.json({ id: await addBankAccount(db, me, org_id, input) }, { status: 201 });
});
