import { NextResponse } from "next/server";
import { documentFieldsSchema } from "@/lib/schemas/fleet";
import { parseJson, requireUuid, route } from "@/server/http";
import { fromDbError, ServiceError } from "@/server/services/errors";
import { getDocument } from "@/server/services/documents";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** Includes a signed file URL that expires after five minutes. */
export const GET = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  return NextResponse.json(await getDocument(await supabaseForRequest(request), id));
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const db = await supabaseForRequest(request);
  const input = await parseJson(request, documentFieldsSchema);
  const { data, error } = await db
    .from("documents")
    .update({
      ...(input.number !== undefined ? { number: input.number } : {}),
      ...(input.issuer !== undefined ? { issuer: input.issuer } : {}),
      ...(input.issueDate !== undefined ? { issue_date: input.issueDate } : {}),
      ...(input.expiryDate !== undefined ? { expiry_date: input.expiryDate } : {}),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
  return NextResponse.json(await getDocument(db, id));
});
