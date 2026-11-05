import { NextResponse } from "next/server";
import { otpVerifySchema } from "@/lib/schemas/auth";
import { parseJson, route } from "@/server/http";
import { verifyOtp } from "@/server/services/auth";
import { supabaseServer } from "@/server/supabase/server";

/** Verifies the code. Sets the session cookie for browsers and returns tokens for API clients. */
export const POST = route(async (request) => {
  const { phone, code } = await parseJson(request, otpVerifySchema);
  const db = await supabaseServer();
  const { session, userId } = await verifyOtp(db, phone, code);
  return NextResponse.json({
    user_id: userId,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  });
});
