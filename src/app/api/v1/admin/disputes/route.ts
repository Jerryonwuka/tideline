import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { listDisputes } from "@/server/services/escrow";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

/** Platform admins: escrow holds under dispute. */
export const GET = route(async (request) => {
  const me = await getMe(await supabaseForRequest(request));
  if (!me?.isPlatformAdmin) throw new ServiceError("forbidden");
  return NextResponse.json(await listDisputes());
});
