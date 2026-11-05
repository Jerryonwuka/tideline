import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { suggestionFor } from "@/server/services/idle";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Charterers ranked for an idle vessel (rules only: past clients first, then demand and area). */
export const GET = route<Ctx>(async (request, { params }) => {
  const s = await suggestionFor(await supabaseForRequest(request), requireUuid((await params).id));
  if (!s) throw new ServiceError("not_found");
  return NextResponse.json(s.buyers);
});
