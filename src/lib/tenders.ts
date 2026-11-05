// §10.5 tender packs: pure rules. Parsed requirements must quote the tender; requirements map to
// stored documents (green valid / amber expires before the deadline / red missing / grey unmatched,
// mapped by hand); drafts may only use facts we hold; export waits for markers and red items.

export interface TenderRequirement {
  id: string;
  category: "company" | "vessel" | "crew" | "hse" | "commercial" | "other";
  description: string;
  source_text: string;
  mandatory: boolean;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9&'"%.]+/g, " ")
    .trim();

/** The quote really is in the tender (ignoring case, spacing and punctuation). */
export function quoteFound(sourceText: string, tenderText: string): boolean {
  const q = norm(sourceText);
  return q.length >= 6 && norm(tenderText).includes(q);
}

export function keepQuoted<T extends { source_text: string }>(requirements: T[], tenderText: string) {
  const kept = requirements.filter((r) => quoteFound(r.source_text, tenderText));
  return { kept, dropped: requirements.length - kept.length };
}

export type ItemStatus = "valid" | "expires_before_deadline" | "missing" | "unmatched";

export interface StoredDoc {
  id: string;
  document_type_code: string;
  subject_type: string;
  subject_id: string;
  expiry_date: string | null;
  effective_status: string | null;
}

/** Which document type a requirement asks for, by keywords; null when it isn't a document we track. */
export function documentTypeFor(req: TenderRequirement, keywords: Record<string, string[]>): string | null {
  const text = ` ${norm(`${req.description} ${req.source_text}`)} `;
  let best: { code: string; len: number } | null = null;
  for (const [code, words] of Object.entries(keywords)) {
    for (const w of words) {
      const k = norm(w);
      if (k && text.includes(` ${k} `) && (!best || k.length > best.len)) best = { code, len: k.length };
    }
  }
  return best?.code ?? null;
}

/**
 * Status of a requirement against stored documents for the chosen vessels (or the company, or
 * crew): the best current copy counts; one that expires before the tender deadline is amber.
 */
export function mapRequirement(
  req: TenderRequirement,
  keywords: Record<string, string[]>,
  docs: StoredDoc[],
  subjects: string[],
  deadline: string | null,
): { document_type_code: string | null; document_id: string | null; status: ItemStatus } {
  const code = documentTypeFor(req, keywords);
  if (!code) return { document_type_code: null, document_id: null, status: "unmatched" };
  const candidates = docs
    .filter(
      (d) =>
        d.document_type_code === code &&
        (subjects.includes(d.subject_id) || d.subject_type === "crew" || d.subject_type === "org"),
    )
    .filter((d) => d.effective_status === "valid" || d.effective_status === "expiring")
    .sort((a, b) => (b.expiry_date ?? "9999").localeCompare(a.expiry_date ?? "9999"));
  const best = candidates[0];
  if (!best) return { document_type_code: code, document_id: null, status: "missing" };
  const expiresFirst = !!deadline && !!best.expiry_date && best.expiry_date < deadline;
  return { document_type_code: code, document_id: best.id, status: expiresFirst ? "expires_before_deadline" : "valid" };
}

export const MISSING_MARKER = /\[MISSING:[^\]]*\]/g;

/** What stops export: [MISSING: …] markers left in sections, and mandatory items still red. */
export function exportBlockers(
  sections: Record<string, string>,
  requirements: TenderRequirement[],
  items: Record<string, { status: ItemStatus; document_id?: string | null }>,
) {
  const markers = Object.entries(sections).flatMap(([section, text]) =>
    [...(text ?? "").matchAll(MISSING_MARKER)].map((m) => ({ section, marker: m[0] })),
  );
  const redMandatory = requirements
    .filter(
      (r) =>
        r.mandatory &&
        (items[r.id]?.status === "missing" || (items[r.id]?.status === "unmatched" && !items[r.id]?.document_id)),
    )
    .map((r) => r.id);
  return { markers, redMandatory, blocked: markers.length > 0 || redMandatory.length > 0 };
}

/** Numbers (counts, years, sizes, amounts) in a draft that appear nowhere in the facts or tender. */
export function unsupportedFigures(draft: string, ...sources: string[]): string[] {
  const allowed = new Set(
    sources.flatMap((s) => [...s.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,/g, ""))),
  );
  const outside = draft.replace(MISSING_MARKER, " ");
  return [
    ...new Set(
      [...outside.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,/g, "")).filter((n) => !allowed.has(n)),
    ),
  ];
}

/** Replaces figures that aren't in the facts with a [MISSING: …] marker for the owner to check. */
export function guardDraft(draft: string, ...sources: string[]): { text: string; replaced: string[] } {
  const bad = unsupportedFigures(draft, ...sources);
  if (!bad.length) return { text: draft, replaced: [] };
  const text = draft.replace(/\d+(?:[.,]\d+)*/g, (m) =>
    bad.includes(m.replace(/,/g, "")) ? `[MISSING: confirm ${m}]` : m,
  );
  return { text, replaced: bad };
}

/** The four drafted sections, in pack order. */
export const SECTIONS = ["cover_letter", "company_profile", "vessel_specification", "hse_statement"] as const;
export type SectionKey = (typeof SECTIONS)[number];
