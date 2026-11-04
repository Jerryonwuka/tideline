import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { scheduleInputSchema } from "@/lib/schemas/ferry";
import { parseJson, route } from "@/server/http";
import { orgIdFrom } from "@/server/http-org";
import { createSchedule, listSchedules } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) =>
  NextResponse.json(await listSchedules(await supabaseForRequest(request), orgIdFrom(request))),
);

export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { orgId, ...input } = await parseJson(request, z.object({ orgId: uuid }).and(scheduleInputSchema));
  return NextResponse.json({ id: await createSchedule(db, orgId, input) }, { status: 201 });
});
