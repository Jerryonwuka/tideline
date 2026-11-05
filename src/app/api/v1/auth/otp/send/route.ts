import { NextResponse } from "next/server";
import { otpSendSchema } from "@/lib/schemas/auth";
import { parseJson, route } from "@/server/http";
import { sendOtp } from "@/server/services/auth";
import { supabaseServer } from "@/server/supabase/server";

export const POST = route(async (request) => {
  const { phone } = await parseJson(request, otpSendSchema);
  const db = await supabaseServer();
  await sendOtp(db, phone);
  return NextResponse.json({ sent: true });
});
