import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { route } from "@/server/http";
import { fromDbError } from "@/server/services/errors";
import { supabaseForRequest } from "@/server/supabase/server";

/** The org's payouts (owners and managers). */
export const GET = route(async (request) => {
  const { org_id } = z.object({ org_id: uuid }).parse(Object.fromEntries(new URL(request.url).searchParams));
  const { data, error } = await (
    await supabaseForRequest(request)
  )
    .from("payouts")
    .select(
      "id, escrow_hold_id, currency, amount_minor, commission_minor, status, failure_reason, provider_transfer_ref, created_at",
    )
    .eq("org_id", org_id)
    .order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  return NextResponse.json(data);
});
