import { NextResponse } from "next/server";
import { fleetCompliance } from "@/server/compliance/vessels";
import { route } from "@/server/http";
import { orgIdFrom } from "@/server/http-org";
import { listDocuments } from "@/server/services/documents";
import { listVessels } from "@/server/services/vessels";
import { supabaseForRequest } from "@/server/supabase/server";

/** Compliance score per vessel and the documents expiring or expired (§6). */
export const GET = route(async (request) => {
  const orgId = orgIdFrom(request);
  const db = await supabaseForRequest(request);
  const [vessels, expiring, expired] = await Promise.all([
    listVessels(db, orgId),
    listDocuments(db, { orgId, status: "expiring" }),
    listDocuments(db, { orgId, status: "expired" }),
  ]);
  const scores = await fleetCompliance(db, orgId, vessels);
  return NextResponse.json({
    vessels: scores.map((s) => ({ vessel_id: s.vesselId, name: s.name, ...s.score })),
    expiring,
    expired,
  });
});
