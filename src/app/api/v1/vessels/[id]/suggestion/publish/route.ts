import { NextResponse } from "next/server";
import { fromMajor } from "@/lib/money";
import { publishSuggestionSchema } from "@/lib/schemas/idle";
import { parseJson, requireUuid, route } from "@/server/http";
import { publishSuggestion, suggestionFor } from "@/server/services/idle";
import { ServiceError } from "@/server/services/errors";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** One-tap publish of the suggestion to the board (optionally with an edited rate). */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const input = await parseJson(request, publishSuggestionSchema);
  const s = await suggestionFor(db, id);
  if (!s) throw new ServiceError("not_found");
  const listingId = await publishSuggestion(db, id, {
    rateMinor: input.dayRate ? fromMajor(input.dayRate, s.currency).amountMinor : undefined,
    area: input.area,
    description: input.description,
  });
  return NextResponse.json({ listing_id: listingId });
});
