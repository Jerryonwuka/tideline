import { z } from "zod";

/** §10.1 Certificate OCR and extraction. Bump the version whenever the wording or schema changes. */
export const OCR_EXTRACT_PROMPT_ID = "ocr_extract";
export const OCR_EXTRACT_PROMPT_VERSION = "ocr-extract@1";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "not a real date");

export const extractionSchema = z.object({
  document_type_code: z.string().nullable(),
  number: z.string().nullable(),
  issuer: z.string().nullable(),
  holder_name: z.string().nullable(),
  vessel_name: z.string().nullable(),
  issue_date: isoDate.nullable(),
  expiry_date: isoDate.nullable(),
  field_confidence: z.record(z.string(), z.number().min(0).max(1)),
  date_format_assumed: z.enum(["DMY", "MDY", "YMD"]).nullable(),
  notes: z.string().nullable(),
});
export type Extraction = z.infer<typeof extractionSchema>;

export interface ExtractionContext {
  countryName: string;
  /** "DMY" | "MDY" | "YMD" from the countries table. */
  dateOrder: string;
  documentTypes: { code: string; name: string }[];
}

export function ocrExtractSystemPrompt(ctx: ExtractionContext): string {
  const types = ctx.documentTypes.map((t) => `${t.code} (${t.name})`).join(", ");
  return [
    `You extract data from maritime and crew documents issued in ${ctx.countryName}.`,
    `Known document types for this country: ${types}.`,
    "Return JSON only, matching the schema. Use null for anything you cannot read clearly.",
    "Never guess a date. Write dates as YYYY-MM-DD. If a date is written with numbers only",
    `(e.g. 05/06/2026), read it in the country's usual order (${ctx.dateOrder}) and set`,
    "date_format_assumed accordingly.",
    "Give a confidence from 0 to 1 for each field.",
  ].join("\n");
}

export function ocrExtractUserMessage(input: { ocrText: string; selectedType: string; subjectName: string }): string {
  return [
    `The uploader selected document type: ${input.selectedType}.`,
    `It should belong to: ${input.subjectName}.`,
    "Text read from the document by OCR (may contain errors):",
    input.ocrText || "(no text found)",
  ].join("\n");
}
