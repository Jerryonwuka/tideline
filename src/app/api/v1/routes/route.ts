import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { routeInputSchema } from "@/lib/schemas/ferry";
import { parseJson, route } from "@/server/http";
import { orgIdFrom } from "@/server/http-org";
import { orgBasics } from "@/server/org-context";
import { createRoute, listRoutes } from "@/server/services/ferry";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) =>
  NextResponse.json(await listRoutes(await supabaseForRequest(request), orgIdFrom(request))),
);

export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { orgId, ...input } = await parseJson(request, z.object({ orgId: uuid }).and(routeInputSchema));
  const org = await orgBasics(db, orgId);
  return NextResponse.json({ id: await createRoute(db, orgId, org.currency, input) }, { status: 201 });
});
