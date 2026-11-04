import { NextResponse } from "next/server";
import { toJson } from "@/lib/money";
import { route } from "@/server/http";
import { SALE_LOOKBACK_MS, tripsForSale } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/** Public: trips with seats left in the next two days (no personal data). */
export const GET = route(async () => {
  const now = new Date();
  const trips = await tripsForSale(
    new Date(now.getTime() - SALE_LOOKBACK_MS),
    new Date(now.getTime() + 2 * 86_400_000),
  );
  return NextResponse.json(trips.map((t) => ({ ...t, fare: toJson(t.fare) })));
});
