import { NextResponse } from "next/server";
import { toJson } from "@/lib/money";
import { requireUuid, route } from "@/server/http";
import { boardListing } from "@/server/services/charter";

type Ctx = { params: Promise<{ id: string }> };

/** One live listing with the documents its owner chose to show (type, status and expiry only). */
export const GET = route<Ctx>(async (_request, { params }) => {
  const listing = await boardListing(requireUuid((await params).id));
  return NextResponse.json({ ...listing, dayRate: toJson(listing.dayRate) });
});
