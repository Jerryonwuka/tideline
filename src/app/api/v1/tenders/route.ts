import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { tenderInputSchema } from "@/lib/schemas/tenders";
import { parseJson, route } from "@/server/http";
import { fromDbError } from "@/server/services/errors";
import { createTender, parseTender } from "@/server/services/tenders";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  const { org_id } = z.object({ org_id: uuid }).parse(Object.fromEntries(new URL(request.url).searchParams));
  const { data, error } = await (
    await supabaseForRequest(request)
  )
    .from("tenders")
    .select("id, title, client_name, deadline, status, created_at")
    .eq("org_id", org_id)
    .order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  return NextResponse.json(data);
});

/** New tender from pasted text; it is read (parsed into a checklist) straight away. */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { org_id, ...input } = await parseJson(request, z.object({ org_id: uuid }).and(tenderInputSchema));
  const id = await createTender(db, org_id, input);
  const parsed = await parseTender(db, id);
  return NextResponse.json({ id, requirements: parsed.requirements.length, dropped: parsed.dropped }, { status: 201 });
});
