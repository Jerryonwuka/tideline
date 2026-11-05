import "server-only";
import type { Json } from "@/lib/database.types";
import { localDate } from "@/lib/dates";
import { extractDocument, reviewHints } from "@/server/ai/document-extraction";
import { OCR_EXTRACT_PROMPT_VERSION } from "@/server/ai/prompts/ocr-extract";
import { integrations } from "@/server/integrations";
import type { Db } from "@/server/supabase/server";
import { supabaseAdmin } from "@/server/supabase/admin";
import { DOCUMENTS_BUCKET, documentTypesFor } from "./documents";
import { fromDbError } from "./errors";

/** Per-org monthly cap on AI calls until plans (M7) carry their own budget. */
const MONTHLY_AI_JOBS = Number(process.env.AI_MONTHLY_JOB_LIMIT ?? 500);
/** Estimated cost per 1,000 tokens in the org's currency minor units; 0 until a vendor is chosen. */
const COST_PER_1K_TOKENS_MINOR = Number(process.env.AI_COST_PER_1K_TOKENS_MINOR ?? 0);

/**
 * Reads a just-uploaded certificate with OCR + AI and stores the result as a draft on the document
 * (documents.extracted). The document stays "needs review" until a person confirms (§10.1, rule 6).
 * Never throws: on any failure the document simply waits for manual entry.
 */
export async function runExtraction(db: Db, documentId: string): Promise<"done" | "failed" | "skipped"> {
  const admin = supabaseAdmin();
  const { data: doc } = await db
    .from("documents")
    .select("id, org_id, subject_type, subject_id, document_type_code, file_path, status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc?.file_path || doc.status !== "needs_review") return "skipped";

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("ai_jobs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", doc.org_id)
    .gte("created_at", monthStart.toISOString());
  if ((count ?? 0) >= MONTHLY_AI_JOBS) return "skipped";

  const [{ data: org }, file] = await Promise.all([
    db.from("orgs").select("country_code, time_zone, countries(name, date_order)").eq("id", doc.org_id).single(),
    db.storage.from(DOCUMENTS_BUCKET).download(doc.file_path),
  ]);
  if (!org || !file.data) return "skipped";

  const subjectName = await subjectNameOf(db, doc.subject_type, doc.subject_id, doc.org_id);
  const country =
    doc.subject_type === "vessel"
      ? ((await db.from("vessels").select("operating_country_code").eq("id", doc.subject_id).single()).data
          ?.operating_country_code ?? org.country_code)
      : org.country_code;
  const types = await documentTypesFor(db, country, doc.subject_type);
  const mimeType = file.data.type || (doc.file_path.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

  const { llm, ocr } = integrations();
  const outcome = await extractDocument(
    { llm, ocr },
    {
      bytes: new Uint8Array(await file.data.arrayBuffer()),
      mimeType,
      selectedType: doc.document_type_code,
      subjectName,
      context: {
        countryName: org.countries?.name ?? country,
        dateOrder: org.countries?.date_order ?? "DMY",
        // Codes only: the prompt carries no personal data.
        documentTypes: types.map((t) => ({ code: t.code, name: t.code.replace(/_/g, " ") })),
      },
    },
  );

  const tokens = outcome.usage ? outcome.usage.tokensIn + outcome.usage.tokensOut : 0;
  const job = {
    org_id: doc.org_id,
    kind: "ocr_extract" as const,
    input_ref: `document:${doc.id}`,
    prompt_version: OCR_EXTRACT_PROMPT_VERSION,
    model: outcome.usage?.model ?? null,
    tokens_in: outcome.usage?.tokensIn ?? null,
    tokens_out: outcome.usage?.tokensOut ?? null,
    latency_ms: outcome.usage?.latencyMs ?? null,
    cost_estimate_minor: Math.round((tokens / 1000) * COST_PER_1K_TOKENS_MINOR),
  };

  if (!outcome.ok) {
    await admin.from("ai_jobs").insert({ ...job, status: "failed", error: outcome.error.slice(0, 500) });
    return "failed";
  }

  const validity = types.find((t) => t.code === doc.document_type_code)?.default_validity_months ?? null;
  const hints = reviewHints(outcome.extraction, {
    subjectName,
    selectedType: doc.document_type_code,
    today: localDate(new Date(), org.time_zone),
    defaultValidityMonths: validity,
  });
  const extracted = {
    ...outcome.extraction,
    review: hints,
    prompt_version: OCR_EXTRACT_PROMPT_VERSION,
  } as unknown as Json;
  await admin.from("ai_jobs").insert({ ...job, status: "done", output: extracted });
  const { error } = await db
    .from("documents")
    .update({ extracted, extraction_confidence: hints.confidence })
    .eq("id", doc.id)
    .eq("status", "needs_review");
  if (error) throw fromDbError(error);
  return "done";
}

async function subjectNameOf(db: Db, subjectType: string, subjectId: string, orgId: string): Promise<string> {
  if (subjectType === "vessel")
    return (await db.from("vessels").select("name").eq("id", subjectId).single()).data?.name ?? "";
  if (subjectType === "crew")
    return (await db.from("crew_members").select("full_name").eq("id", subjectId).single()).data?.full_name ?? "";
  return (await db.from("orgs").select("name").eq("id", orgId).single()).data?.name ?? "";
}
