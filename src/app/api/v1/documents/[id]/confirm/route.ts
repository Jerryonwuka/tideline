import { NextResponse } from "next/server";
import { confirmDocumentSchema } from "@/lib/schemas/fleet";
import { parseJson, requireUuid, route } from "@/server/http";
import { confirmDocument, getDocument } from "@/server/services/documents";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Human review of a document (and, from M3, of its AI-extracted fields). */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  await confirmDocument(db, me.userId, id, await parseJson(request, confirmDocumentSchema));
  return NextResponse.json(await getDocument(db, id));
});
