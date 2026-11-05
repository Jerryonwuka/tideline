import { addDays } from "@/lib/dates";
import type { LlmClient, LlmImage, LlmUsage } from "@/server/integrations/llm/types";
import type { OcrClient } from "@/server/integrations/ocr/types";
import {
  extractionSchema,
  OCR_EXTRACT_PROMPT_ID,
  OCR_EXTRACT_PROMPT_VERSION,
  ocrExtractSystemPrompt,
  ocrExtractUserMessage,
  type Extraction,
  type ExtractionContext,
} from "./prompts/ocr-extract";

/** Fields below this confidence (or missing expiry) are highlighted for the reviewer (§10.1). */
export const CONFIDENCE_THRESHOLD = 0.8;
const KEY_FIELDS = ["number", "issuer", "issue_date", "expiry_date"] as const;

export interface ReviewHints {
  lowConfidence: string[];
  flags: ("name_mismatch" | "expired" | "type_mismatch" | "no_expiry")[];
  suggestedExpiry: string | null;
  /** Lowest confidence among the key fields that were read. */
  confidence: number | null;
}

const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Post-extraction rules from §10.1. Pure; `today` is the org-local date. */
export function reviewHints(
  x: Extraction,
  ctx: { subjectName: string; selectedType: string; today: string; defaultValidityMonths: number | null },
): ReviewHints {
  const lowConfidence = KEY_FIELDS.filter(
    (f) => x[f] !== null && (x.field_confidence[f] ?? 0) < CONFIDENCE_THRESHOLD,
  ).map(String);
  if (x.expiry_date === null) lowConfidence.push("expiry_date");

  const flags: ReviewHints["flags"] = [];
  const name = x.vessel_name ?? x.holder_name;
  if (name) {
    const a = normal(name);
    const b = normal(ctx.subjectName);
    if (a && b && !a.includes(b) && !b.includes(a)) flags.push("name_mismatch");
  }
  if (x.expiry_date && x.expiry_date < ctx.today) flags.push("expired");
  if (x.document_type_code && x.document_type_code !== ctx.selectedType) flags.push("type_mismatch");
  if (!x.expiry_date) flags.push("no_expiry");

  let suggestedExpiry: string | null = null;
  if (!x.expiry_date && x.issue_date && ctx.defaultValidityMonths) {
    const d = new Date(`${x.issue_date}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + ctx.defaultValidityMonths);
    suggestedExpiry = addDays(d.toISOString().slice(0, 10), -1);
  }

  const read = KEY_FIELDS.filter((f) => x[f] !== null).map((f) => x.field_confidence[f] ?? 0);
  return {
    lowConfidence: [...new Set(lowConfidence)],
    flags,
    suggestedExpiry,
    confidence: read.length ? Math.min(...read) : null,
  };
}

export type ExtractionOutcome =
  | { ok: true; extraction: Extraction; usage: LlmUsage; attempts: number }
  | { ok: false; error: string; usage: LlmUsage | null; attempts: number };

/**
 * OCR → structured extraction, validated with Zod. On invalid output the model gets one retry
 * with the validation error; after that the caller falls back to manual entry (§10).
 */
export async function extractDocument(
  deps: { llm: LlmClient; ocr: OcrClient },
  input: { bytes: Uint8Array; mimeType: string; selectedType: string; subjectName: string; context: ExtractionContext },
): Promise<ExtractionOutcome> {
  const started = Date.now();
  const ocr = await deps.ocr
    .extractText([{ mimeType: input.mimeType, bytes: input.bytes }])
    .catch(() => ({ pages: [], model: "none" }));
  const ocrText = ocr.pages
    .map((p) => p.text)
    .join("\n\n")
    .slice(0, 8000);
  const images: LlmImage[] = input.mimeType.startsWith("image/")
    ? [{ mimeType: input.mimeType, data: Buffer.from(input.bytes).toString("base64") }]
    : [];
  const system = ocrExtractSystemPrompt(input.context);
  const messages = [
    {
      role: "user" as const,
      content: ocrExtractUserMessage({ ocrText, selectedType: input.selectedType, subjectName: input.subjectName }),
      images,
    },
  ];

  let usage: LlmUsage | null = null;
  let lastError = "no output";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await deps.llm.generateStructured({
        promptId: OCR_EXTRACT_PROMPT_ID,
        promptVersion: OCR_EXTRACT_PROMPT_VERSION,
        system,
        messages:
          attempt === 1
            ? messages
            : [
                ...messages,
                {
                  role: "user" as const,
                  content: `Your previous answer was invalid: ${lastError}. Return JSON matching the schema exactly.`,
                },
              ],
        schema: extractionSchema,
        schemaName: "certificate_extraction",
      });
      usage = usage
        ? {
            ...result.usage,
            tokensIn: usage.tokensIn + result.usage.tokensIn,
            tokensOut: usage.tokensOut + result.usage.tokensOut,
          }
        : result.usage;
      const parsed = extractionSchema.safeParse(result.raw);
      if (parsed.success) {
        return {
          ok: true,
          extraction: parsed.data,
          usage: { ...usage, latencyMs: Date.now() - started },
          attempts: attempt,
        };
      }
      lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (err) {
      lastError = err instanceof Error ? err.message : "llm call failed";
    }
  }
  return {
    ok: false,
    error: lastError,
    usage: usage ? { ...usage, latencyMs: Date.now() - started } : null,
    attempts: 2,
  };
}
