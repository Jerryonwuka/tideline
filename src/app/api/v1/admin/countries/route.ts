import { NextResponse } from "next/server";
import { z } from "zod";
import { countryCodeSchema } from "@/lib/schemas/common";
import { updateCountrySchema } from "@/lib/schemas/countries";
import { assertPlatformAdmin } from "@/server/admin";
import { parseJson, route } from "@/server/http";
import { listAllCountries, updateCountry } from "@/server/services/countries";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) => {
  const db = await supabaseForRequest(request);
  await assertPlatformAdmin(db);
  return NextResponse.json(await listAllCountries(db));
});

export const PUT = route(async (request) => {
  const db = await supabaseForRequest(request);
  await assertPlatformAdmin(db);
  const body = await parseJson(request, z.object({ code: countryCodeSchema }).and(updateCountrySchema));
  const { code, ...patch } = body;
  return NextResponse.json(await updateCountry(db, code, patch));
});
