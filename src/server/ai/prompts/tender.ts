import { z } from "zod";

/** §10.5 tender parsing and drafting. Bump versions when wording or schema change. */
export const TENDER_PARSE_PROMPT_ID = "tender_parse";
export const TENDER_PARSE_PROMPT_VERSION = "tender-parse@1";
export const TENDER_DRAFT_PROMPT_ID = "tender_draft";
export const TENDER_DRAFT_PROMPT_VERSION = "tender-draft@1";

export const TENDER_PARSE_SYSTEM = `You read an oil and gas vessel-hire tender or invitation to bid. List every document or
information requirement the bidder must submit, and the key commercial facts.
Return JSON only. For each requirement, quote the tender's own wording in source_text.
Do not add requirements that are not in the text.`;

const n = z.number().nullable();
export const tenderParseSchema = z.object({
  title: z.string().nullable(),
  client: z.string().nullable(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  contract_period: z.string().nullable(),
  vessel_requirements: z.object({
    type: z.string().nullable(),
    min_length_m: n,
    capacity: n,
    dp_class: z.string().nullable(),
    max_age_years: n,
    other: z.string().nullable(),
  }),
  requirements: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        category: z.enum(["company", "vessel", "crew", "hse", "commercial", "other"]),
        description: z.string().min(2).max(500),
        source_text: z.string().min(6).max(1000),
        mandatory: z.boolean(),
      }),
    )
    .max(150),
});
export type TenderParse = z.infer<typeof tenderParseSchema>;

import { SECTIONS, type SectionKey } from "@/lib/tenders";
export { SECTIONS, type SectionKey };
const SECTION_NAMES: Record<SectionKey, string> = {
  cover_letter: "cover letter",
  company_profile: "company profile",
  vessel_specification: "vessel specification sheet",
  hse_statement: "HSE statement",
};

export function tenderDraftPrompt(section: SectionKey, facts: unknown, requirements: unknown): string {
  return `Draft the ${SECTION_NAMES[section]} for a tender response using ONLY the facts below about the company and
vessels. Do not invent certificates, numbers, clients, dates or experience. Where the tender
needs a fact that is not provided, write [MISSING: what is needed] so the owner can fill it in.
Write plain, formal business English.
Facts: ${JSON.stringify(facts)}
Tender requirements: ${JSON.stringify(requirements)}
SECTION ${section}`;
}
