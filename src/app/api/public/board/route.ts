import { NextResponse } from "next/server";
import { toJson } from "@/lib/money";
import { boardQuerySchema } from "@/lib/schemas/charter";
import { route } from "@/server/http";
import { boardListings } from "@/server/services/charter";

export const dynamic = "force-dynamic";

/** Public spot-charter board: live listings with filters. No private documents or rates. */
export const GET = route(async (request) => {
  const q = boardQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const listings = await boardListings({
    type: q.type,
    area: q.area,
    from: q.from,
    to: q.to,
    minCapacity: q.min_capacity,
  });
  return NextResponse.json(listings.map((l) => ({ ...l, dayRate: toJson(l.dayRate) })));
});
