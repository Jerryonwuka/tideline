import { NextResponse } from "next/server";
import { z } from "zod";
import { toJson } from "@/lib/money";
import { uuid } from "@/lib/schemas/common";
import { route } from "@/server/http";
import { orgBasics } from "@/server/org-context";
import { weekStart, weeklyReport } from "@/server/services/dashboard";
import { supabaseForRequest } from "@/server/supabase/server";

const query = z.object({ org_id: uuid, week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** Seven days from the Monday of `week`: trips, takings, expenses and net (money as minor units). */
export const GET = route(async (request) => {
  const q = query.parse(Object.fromEntries(new URL(request.url).searchParams));
  const db = await supabaseForRequest(request);
  const org = await orgBasics(db, q.org_id);
  const r = await weeklyReport(
    db,
    { id: q.org_id, time_zone: org.time_zone, currency: org.currency },
    weekStart(q.week),
  );
  const j = toJson;
  return NextResponse.json({
    ...r,
    days: r.days.map((d) => ({ ...d, cash: j(d.cash), digital: j(d.digital) })),
    vessels: r.vessels.map((v) => ({ ...v, cash: j(v.cash), digital: j(v.digital) })),
    expenses: r.expenses.map((e) => ({ ...e, amount: j(e.amount) })),
    totals: {
      ...r.totals,
      cash: j(r.totals.cash),
      digital: j(r.totals.digital),
      expenses: j(r.totals.expenses),
      net: j(r.totals.net),
    },
  });
});
