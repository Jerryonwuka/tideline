import { NextResponse } from "next/server";
import { z } from "zod";
import { createDocumentSchema, documentStatusSchema, subjectTypeSchema } from "@/lib/schemas/fleet";
import { parseJson, route } from "@/server/http";
import { createDocument, getDocument, listDocuments } from "@/server/services/documents";
import { ServiceError } from "@/server/services/errors";
import { runExtraction } from "@/server/services/extraction";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

const listQuery = z.object({
  org_id: z.uuid(),
  subject_type: subjectTypeSchema.optional(),
  subject_id: z.uuid().optional(),
  status: documentStatusSchema.optional(),
});

export const GET = route(async (request) => {
  const q = listQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  const db = await supabaseForRequest(request);
  return NextResponse.json(
    await listDocuments(db, {
      orgId: q.org_id,
      subjectType: q.subject_type,
      subjectId: q.subject_id,
      status: q.status,
    }),
  );
});

export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const input = await parseJson(request, createDocumentSchema);
  const id = await createDocument(db, me.userId, input);
  if (input.filePath && !input.expiryDate) await runExtraction(db, id).catch(() => "failed");
  return NextResponse.json(await getDocument(db, id), { status: 201 });
});
