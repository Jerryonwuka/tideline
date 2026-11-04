import { NextResponse } from "next/server";
import { requireUuid, route } from "@/server/http";
import { packState } from "@/server/services/tenders";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Tender, checklist with statuses, drafted sections and what holds the export. */
export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const { pack, tender, requirements, blockers } = await packState(await supabaseForRequest(request), id);
  const { export_path: _e, zip_path: _z, ...packOut } = pack;
  return NextResponse.json({
    tender: { ...tender, requirements_text: undefined },
    pack: packOut,
    requirements,
    blockers,
  });
});
