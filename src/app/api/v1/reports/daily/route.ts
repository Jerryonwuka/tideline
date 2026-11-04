import { NextResponse } from "next/server";
import { localDate } from "@/lib/dates";
import { toJson } from "@/lib/money";
import { reportQuerySchema } from "@/lib/schemas/ferry";
import { route } from "@/server/http";
import { orgBasics } from "@/server/org-context";
import { dailyReport } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  const q = reportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const db = await supabaseForRequest(request);
  const org = await orgBasics(db, q.org_id);
  const report = await dailyReport(
    db,
    q.org_id,
    q.date ?? localDate(new Date(), org.time_zone),
    org.time_zone,
    org.currency,
    q.vessel_id,
  );
  return NextResponse.json({
    date: report.date,
    rows: report.rows.map((r) => ({
      vessel_id: r.vesselId,
      vessel: r.vesselName,
      trips: r.trips,
      passengers: r.passengers,
      cash: toJson(r.cash),
      digital: toJson(r.digital),
    })),
    totals: { ...report.totals, cash: toJson(report.totals.cash), digital: toJson(report.totals.digital) },
  });
});
