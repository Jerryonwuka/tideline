import { NextResponse } from "next/server";
import { overrideRequestSchema } from "@/lib/schemas/safety";
import { parseJson, requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import { requestOverride } from "@/server/services/safety";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Asks the owner to override a block (409 not_overridable for capacity / life jackets). */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const { note } = await parseJson(request, overrideRequestSchema);
  return NextResponse.json({ id: await requestOverride(db, me, id, note) }, { status: 201 });
});
