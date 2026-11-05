import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { publicTripStatus } from "@/server/services/tracking";

type Ctx = { params: Promise<{ id: string }> };

/** Public trip status for passengers (no personal data). */
export const GET = route<Ctx>(async (_request, { params }) =>
  NextResponse.json(await publicTripStatus(requireUuid((await params).id))),
);
