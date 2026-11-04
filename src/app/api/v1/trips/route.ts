import { NextResponse } from "next/server";
import { z } from "zod";
import { localDate } from "@/lib/dates";
import { uuid } from "@/lib/schemas/common";
import { adHocTripSchema } from "@/lib/schemas/ferry";
import { parseJson, route } from "@/server/http";
import { myCrewId, orgBasics } from "@/server/org-context";
import { ServiceError } from "@/server/services/errors";
import { createAdHocTrip, getTrip, listTripsForDate, materialiseToday } from "@/server/services/ferry";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

const listQuery = z.object({
  org_id: uuid,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  vessel_id: uuid.optional(),
});

/** Trips for a local date (default today); today's scheduled trips are created on first read. */
export const GET = route(async (request) => {
  const q = listQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  const db = await supabaseForRequest(request);
  const org = await orgBasics(db, q.org_id);
  const today = localDate(new Date(), org.time_zone);
  if (!q.date || q.date === today) await materialiseToday(db, q.org_id, org.time_zone);
  return NextResponse.json(await listTripsForDate(db, q.org_id, q.date ?? today, org.time_zone, q.vessel_id));
});

/** Ad-hoc trip. Captains start trips as themselves; idempotent by clientId (offline, M5). */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const { orgId, ...input } = await parseJson(request, z.object({ orgId: uuid }).and(adHocTripSchema));
  const org = await orgBasics(db, orgId);
  const id = await createAdHocTrip(db, orgId, org.currency, await myCrewId(db, orgId, me.userId), input);
  return NextResponse.json(await getTrip(db, id), { status: 201 });
});
