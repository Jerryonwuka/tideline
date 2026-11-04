import "server-only";
import { randomUUID } from "node:crypto";
import { datesInOrder } from "@/lib/documents";
import type { CreateDocumentInput, DocumentStatus, SubjectType } from "@/lib/schemas/fleet";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

export const DOCUMENTS_BUCKET = "documents";
/** Signed links to stored files expire after five minutes. */
export const SIGNED_URL_SECONDS = 300;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const LIVE_COLUMNS =
  "id, org_id, subject_type, subject_id, document_type_code, number, issuer, issue_date, expiry_date, file_path, status, effective_status, days_to_expiry, reviewed_at, created_at, extracted, extraction_confidence";

export function storagePath(orgId: string, subjectType: SubjectType, subjectId: string, contentType: string): string {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new ServiceError("validation");
  return `${orgId}/${subjectType}/${subjectId}/${randomUUID()}.${ext}`;
}

/** A one-time URL the browser uploads straight to private storage with. Storage RLS checks the role. */
export async function createUploadUrl(
  db: Db,
  orgId: string,
  subjectType: SubjectType,
  subjectId: string,
  contentType: string,
) {
  const path = storagePath(orgId, subjectType, subjectId, contentType);
  const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new ServiceError("forbidden");
  return { path, token: data.token, signedUrl: data.signedUrl };
}

export async function signedFileUrl(db: Db, path: string): Promise<string | null> {
  const { data } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

export async function documentTypesFor(db: Db, country: string, appliesTo: SubjectType) {
  const { data, error } = await db.rpc("document_types_for", { p_country: country, p_applies_to: appliesTo });
  if (error) throw fromDbError(error);
  return data;
}

export interface DocumentFilter {
  orgId: string;
  subjectType?: SubjectType;
  subjectId?: string;
  status?: DocumentStatus;
}

/** Current (not replaced) documents with their status as of today in the org's time zone. */
export async function listDocuments(db: Db, filter: DocumentFilter) {
  let q = db.from("documents_live").select(LIVE_COLUMNS).eq("org_id", filter.orgId);
  if (filter.subjectType) q = q.eq("subject_type", filter.subjectType);
  if (filter.subjectId) q = q.eq("subject_id", filter.subjectId);
  if (filter.status) q = q.eq("effective_status", filter.status);
  const { data, error } = await q.order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw fromDbError(error);
  return data;
}

export async function getDocument(db: Db, id: string) {
  const { data, error } = await db.from("documents_live").select(LIVE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  return { ...data, fileUrl: data.file_path ? await signedFileUrl(db, data.file_path) : null };
}

/** Older copies of the same document for the same subject are marked as replaced by the new one. */
async function supersedeOlder(
  db: Db,
  doc: { id: string; org_id: string; subject_type: SubjectType; subject_id: string; document_type_code: string },
) {
  const { error } = await db
    .from("documents")
    .update({ replaced_by: doc.id })
    .eq("org_id", doc.org_id)
    .eq("subject_type", doc.subject_type)
    .eq("subject_id", doc.subject_id)
    .eq("document_type_code", doc.document_type_code)
    .neq("id", doc.id)
    .is("replaced_by", null);
  if (error) throw fromDbError(error);
}

/**
 * Records a document. Dates typed in by a person count as reviewed; without an expiry date the
 * document waits in "needs review" (and the AI extraction in M3 fills the same queue).
 */
export async function createDocument(db: Db, userId: string, input: CreateDocumentInput) {
  if (!datesInOrder(input.issueDate, input.expiryDate))
    throw new ServiceError("validation", { expiryDate: "before_issue" });
  const reviewed = !!input.expiryDate;
  const { data, error } = await db
    .from("documents")
    .insert({
      org_id: input.orgId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      document_type_code: input.documentTypeCode,
      number: input.number ?? null,
      issuer: input.issuer ?? null,
      issue_date: input.issueDate ?? null,
      expiry_date: input.expiryDate ?? null,
      file_path: input.filePath ?? null,
      status: reviewed ? "valid" : "needs_review",
      reviewed_by: reviewed ? userId : null,
      reviewed_at: reviewed ? new Date().toISOString() : null,
    })
    .select("id, org_id, subject_type, subject_id, document_type_code")
    .single();
  if (error) throw error.message === "invalid_subject" ? new ServiceError("validation") : fromDbError(error);
  if (reviewed) await supersedeOlder(db, data);
  return data.id;
}

/** Human review: confirm (with any corrected fields) or reject. */
export async function confirmDocument(
  db: Db,
  userId: string,
  id: string,
  input: { number?: string; issuer?: string; issueDate?: string; expiryDate?: string; reject: boolean },
) {
  if (!datesInOrder(input.issueDate, input.expiryDate))
    throw new ServiceError("validation", { expiryDate: "before_issue" });
  const { data, error } = await db
    .from("documents")
    .update({
      ...(input.number !== undefined ? { number: input.number } : {}),
      ...(input.issuer !== undefined ? { issuer: input.issuer } : {}),
      ...(input.issueDate !== undefined ? { issue_date: input.issueDate } : {}),
      ...(input.expiryDate !== undefined ? { expiry_date: input.expiryDate } : {}),
      status: input.reject ? "rejected" : "valid",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, org_id, subject_type, subject_id, document_type_code")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
  if (!input.reject) await supersedeOlder(db, data);
}
