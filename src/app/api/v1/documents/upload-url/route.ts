import { NextResponse } from "next/server";
import { uploadUrlSchema } from "@/lib/schemas/fleet";
import { parseJson, route } from "@/server/http";
import { createUploadUrl } from "@/server/services/documents";
import { supabaseForRequest } from "@/server/supabase/server";

/** Signed, single-use upload URL into private storage (§6). Compress images on the device first. */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const { orgId, subjectType, subjectId, contentType } = await parseJson(request, uploadUrlSchema);
  const { path, token, signedUrl } = await createUploadUrl(db, orgId, subjectType, subjectId, contentType);
  return NextResponse.json({ path, token, signed_url: signedUrl }, { status: 201 });
});
