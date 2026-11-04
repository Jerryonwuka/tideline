import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUuid, route } from "@/server/http";
import { setRouteActive } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const { active } = await parseJson(request, z.object({ active: z.boolean() }));
  await setRouteActive(await supabaseForRequest(request), id, active);
  return NextResponse.json({ id, active });
});
