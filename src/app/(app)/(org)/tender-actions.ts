"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mappingSchema, sectionSchema, tenderInputSchema, vesselsSchema } from "@/lib/schemas/tenders";
import { requireOrgContext } from "@/server/auth/session";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import {
  createTender,
  draftSections,
  exportPack,
  mapManually,
  markReviewed,
  parseTender,
  readTenderFile,
  refreshMapping,
  saveSection,
  setSubmitAnyway,
} from "@/server/services/tenders";

export type TenderState = { error?: ErrorCode; ok?: boolean };
const code = (err: unknown): ErrorCode => {
  if (err instanceof ServiceError) return err.code;
  console.error("tender action failed", err instanceof Error ? err.message : err);
  return "unknown";
};
const MAX_FILE = 15 * 1024 * 1024;

export async function createTenderAction(_: TenderState, formData: FormData): Promise<TenderState> {
  const { db, membership } = await requireOrgContext("/tenders/new");
  const parsed = tenderInputSchema.safeParse({
    title: formData.get("title"),
    clientName: formData.get("clientName") || undefined,
    deadline: formData.get("deadline") || undefined,
    text: formData.get("text") ?? "",
  });
  if (!parsed.success) return { error: "validation" };
  let id: string;
  try {
    let { text } = parsed.data;
    let filePath: string | undefined;
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE) return { error: "validation" };
      const read = await readTenderFile(membership.orgId, {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || "application/pdf",
        name: file.name,
      });
      filePath = read.path;
      text = [text, read.text].filter(Boolean).join("\n\n");
    }
    id = await createTender(db, membership.orgId, { ...parsed.data, text, filePath });
  } catch (err) {
    return { error: code(err) };
  }
  try {
    await parseTender(db, id);
  } catch {
    // The tender is saved; the page offers "Read again".
  }
  redirect(`/tenders/${id}`);
}

async function withTender(
  formData: FormData,
  fn: (ctx: Awaited<ReturnType<typeof requireOrgContext>>, id: string) => Promise<unknown>,
): Promise<TenderState> {
  const id = String(formData.get("tenderId"));
  const ctx = await requireOrgContext(`/tenders/${id}`);
  try {
    await fn(ctx, id);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/tenders/${id}`);
  return { ok: true };
}

export async function parseTenderAction(_: TenderState, formData: FormData) {
  return withTender(formData, ({ db }, id) => parseTender(db, id));
}

export async function vesselsAction(_: TenderState, formData: FormData) {
  const parsed = vesselsSchema.safeParse({ vesselIds: formData.getAll("vesselId").map(String) });
  if (!parsed.success) return { error: "validation" as const };
  return withTender(formData, ({ db }, id) => refreshMapping(db, id, parsed.data.vesselIds));
}

export async function mappingAction(_: TenderState, formData: FormData) {
  const parsed = mappingSchema.safeParse({
    requirementId: formData.get("requirementId"),
    documentId: formData.get("documentId") || null,
  });
  if (!parsed.success) return { error: "validation" as const };
  return withTender(formData, ({ db }, id) => mapManually(db, id, parsed.data.requirementId, parsed.data.documentId));
}

export async function draftAction(_: TenderState, formData: FormData) {
  return withTender(formData, ({ db }, id) => draftSections(db, id));
}

export async function sectionAction(_: TenderState, formData: FormData) {
  const parsed = sectionSchema.safeParse({ section: formData.get("section"), text: formData.get("text") ?? "" });
  if (!parsed.success) return { error: "validation" as const };
  return withTender(formData, ({ db }, id) => saveSection(db, id, parsed.data.section, parsed.data.text));
}

export async function reviewAction(_: TenderState, formData: FormData) {
  return withTender(formData, ({ db, me }, id) => markReviewed(db, me, id));
}

export async function submitAnywayAction(_: TenderState, formData: FormData) {
  return withTender(formData, ({ db, me }, id) => setSubmitAnyway(db, me, id, formData.get("on") === "on"));
}

export async function exportAction(_: TenderState, formData: FormData) {
  return withTender(formData, ({ db, me }, id) => exportPack(db, me, id));
}
