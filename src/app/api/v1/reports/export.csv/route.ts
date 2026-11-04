import { addDays, daysBetween } from "@/lib/dates";
import { toMajorString, money } from "@/lib/money";
import { exportQuerySchema } from "@/lib/schemas/ferry";
import { route } from "@/server/http";
import { orgBasics } from "@/server/org-context";
import { ServiceError } from "@/server/services/errors";
import { listTripsForDate, tripLabel } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Trip-level CSV for a date range (max 92 days). No passenger personal data. */
export const GET = route(async (request) => {
  const q = exportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const days = daysBetween(q.from, q.to);
  if (days < 0 || days > 92) throw new ServiceError("validation", { to: "range" });
  const db = await supabaseForRequest(request);
  const org = await orgBasics(db, q.org_id);
  const lines = [
    ["date", "vessel", "route", "status", "departed", "arrived", "passengers", "cash", "digital", "currency"].join(","),
  ];
  for (let d = q.from; d <= q.to; d = addDays(d, 1)) {
    for (const t of await listTripsForDate(db, q.org_id, d, org.time_zone)) {
      lines.push(
        [
          d,
          t.vessel?.name ?? "",
          tripLabel(t),
          t.status,
          t.actual_departure ?? "",
          t.actual_arrival ?? "",
          t.passenger_count,
          toMajorString(money(t.takings_cash_minor, t.currency)),
          toMajorString(money(t.takings_digital_minor, t.currency)),
          t.currency,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="trips-${q.from}-to-${q.to}.csv"`,
    },
  });
});
