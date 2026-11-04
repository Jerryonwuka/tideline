import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { listEnabledCountries } from "@/server/services/countries";
import { supabaseForRequest } from "@/server/supabase/server";

export const GET = route(async (request) =>
  NextResponse.json(await listEnabledCountries(await supabaseForRequest(request))),
);
