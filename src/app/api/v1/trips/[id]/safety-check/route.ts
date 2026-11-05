import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import { latestSafety, listChecks, runSafetyCheck } from "@/server/services/safety";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** The latest check (with acknowledgement / override) and the trip's check history. */
export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const [latest, history] = await Promise.all([latestSafety(db, id), listChecks(db, id)]);
  return NextResponse.json({ latest, history });
});

/** Runs the safety rules now (weather, night, capacity and life jackets, documents) and stores the result. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  return NextResponse.json(await runSafetyCheck(db, me, id), { status: 201 });
});
