import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, requireUuid, route } from "@/server/http";
import { acceptContract } from "@/server/services/contracts";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** One side accepts the contract: typed name, time, IP and user agent are recorded. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const { name } = await parseJson(request, z.object({ name: z.string().trim().min(2).max(120) }));
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
  const side = await acceptContract(await supabaseForRequest(request), id, name, ip, request.headers.get("user-agent"));
  return NextResponse.json({ side });
});
