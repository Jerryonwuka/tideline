import { NextResponse } from "next/server";
import { tripActionSchema } from "@/lib/schemas/ferry";
import { parseJson, requireUuid, route } from "@/server/http";
import { arrive, cancelTrip, depart, getTrip, setLifejackets, startBoarding } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json(await getTrip(await supabaseForRequest(request), id));
});

/** Status and checklist changes: {action: "boarding" | "lifejackets" | "depart" | "arrive" | "cancel"}. */
export const PATCH = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const body = await parseJson(request, tripActionSchema);
  const trip = await getTrip(db, id);
  if (body.action === "boarding") await startBoarding(db, id);
  if (body.action === "lifejackets") await setLifejackets(db, id, body.confirmed);
  if (body.action === "depart") await depart(db, id);
  if (body.action === "arrive") await arrive(db, id, trip.currency, body.cash, body.notes);
  if (body.action === "cancel") await cancelTrip(db, id, body.notes);
  return NextResponse.json(await getTrip(db, id));
});
