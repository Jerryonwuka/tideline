import { NextResponse } from "next/server";
import { countryCodeSchema } from "@/lib/schemas/common";
import { route } from "@/server/http";
import { countryConfig } from "@/server/services/countries";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ code: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const code = countryCodeSchema.parse((await params).code.toUpperCase());
  return NextResponse.json(await countryConfig(await supabaseForRequest(request), code));
});
