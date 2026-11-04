import "server-only";
import { strToU8, zipSync } from "fflate";
import { TENDER_KEYWORDS } from "@/config/tender-keywords";
import type { Json } from "@/lib/database.types";
import { localDate } from "@/lib/dates";
import {
  exportBlockers,
  guardDraft,
  keepQuoted,
  mapRequirement,
  type ItemStatus,
  type StoredDoc,
  type TenderRequirement,
} from "@/lib/tenders";
import {
  SECTIONS,
  TENDER_DRAFT_PROMPT_ID,
  TENDER_DRAFT_PROMPT_VERSION,
  TENDER_PARSE_PROMPT_ID,
  TENDER_PARSE_PROMPT_VERSION,
  TENDER_PARSE_SYSTEM,
  tenderDraftPrompt,
  tenderParseSchema,
  type SectionKey,
  type TenderParse,
} from "@/server/ai/prompts/tender";
import { integrations } from "@/server/integrations";
import type { Me } from "@/server/services/profile";
import { appendFiles, renderPdf, type PdfBlock } from "@/server/pdf";
import { supabaseAdmin } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { BUSINESS_BUCKET } from "./contracts";
import { DOCUMENTS_BUCKET } from "./documents";
import { fromDbError, ServiceError } from "./errors";

// §10.5 tender packs: the tender is parsed into a checklist (every item quotes the tender), mapped to
// stored documents, four sections are drafted from stored facts only, the owner edits and reviews,
// and export (merged PDF with an index + ZIP) waits for [MISSING] markers and red mandatory items
// unless the owner ticks "Submit anyway", which is recorded and audited.

type Items = Record<
  string,
  { status: ItemStatus; document_id: string | null; document_type_code: string | null; manual?: boolean }
>;

async function logJob(
  orgId: string,
  kind: "tender_parse" | "tender_draft",
  ref: string,
  version: string,
  ok: boolean,
  usage: { model: string | null; tokensIn: number; tokensOut: number },
  started: number,
  error?: string,
) {
  await supabaseAdmin()
    .from("ai_jobs")
    .insert({
      org_id: orgId,
      kind,
      input_ref: ref,
      prompt_version: version,
      model: usage.model,
      tokens_in: usage.tokensIn,
      tokens_out: usage.tokensOut,
      latency_ms: Date.now() - started,
      status: ok ? "done" : "failed",
      error: error ?? null,
    });
}

/** A tender PDF or photo: stored privately, then its text is read with OCR (pasted text is used as-is). */
export async function readTenderFile(orgId: string, file: { bytes: Uint8Array; mimeType: string; name: string }) {
  const ext =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "pdf";
  const path = `${orgId}/tenders/source-${crypto.randomUUID()}.${ext}`;
  const up = await supabaseAdmin()
    .storage.from(BUSINESS_BUCKET)
    .upload(path, file.bytes, { contentType: file.mimeType });
  if (up.error) throw new Error(`tender upload: ${up.error.message}`);
  const out = await integrations().ocr.extractText([{ mimeType: file.mimeType, bytes: file.bytes }]);
  return {
    path,
    text: out.pages
      .map((p) => p.text)
      .join("\n\n")
      .trim(),
  };
}

export async function createTender(
  db: Db,
  orgId: string,
  input: { title: string; clientName?: string; deadline?: string; text: string; filePath?: string },
) {
  if (!input.text.trim()) throw new ServiceError("tender_no_text");
  const { data, error } = await db
    .from("tenders")
    .insert({
      org_id: orgId,
      title: input.title,
      client_name: input.clientName || null,
      deadline: input.deadline || null,
      requirements_text: input.text,
      requirements_file_path: input.filePath ?? null,
    })
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  return data.id;
}

/** Step 1: parse with the §10.5 prompt; requirements whose quote isn't in the tender are dropped. */
export async function parseTender(db: Db, tenderId: string) {
  const { data: t } = await db.from("tenders").select("*").eq("id", tenderId).maybeSingle();
  if (!t) throw new ServiceError("not_found");
  const started = Date.now();
  let usage = { model: null as string | null, tokensIn: 0, tokensOut: 0 };
  let parsed: TenderParse | null = null;
  let lastError = "no output";
  for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
    try {
      const out = await integrations().llm.generateStructured({
        promptId: TENDER_PARSE_PROMPT_ID,
        promptVersion: TENDER_PARSE_PROMPT_VERSION,
        system: TENDER_PARSE_SYSTEM,
        messages: [
          { role: "user", content: t.requirements_text.slice(0, 60000) },
          ...(attempt > 1
            ? [
                {
                  role: "user" as const,
                  content: `Your previous answer was invalid: ${lastError}. Return JSON matching the schema.`,
                },
              ]
            : []),
        ],
        schema: tenderParseSchema,
        schemaName: "tender_requirements",
      });
      usage = {
        model: out.usage.model,
        tokensIn: usage.tokensIn + out.usage.tokensIn,
        tokensOut: usage.tokensOut + out.usage.tokensOut,
      };
      const v = tenderParseSchema.safeParse(out.raw);
      if (v.success) parsed = v.data;
      else lastError = v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (err) {
      lastError = err instanceof Error ? err.message : "error";
    }
  }
  await logJob(
    t.org_id,
    "tender_parse",
    `tender:${t.id}`,
    TENDER_PARSE_PROMPT_VERSION,
    !!parsed,
    usage,
    started,
    parsed ? undefined : lastError.slice(0, 500),
  );
  if (!parsed) throw new ServiceError("validation");
  // Every checklist item must quote the tender (§10.5): anything else is dropped.
  const { kept, dropped } = keepQuoted(parsed.requirements, t.requirements_text);
  const result = { ...parsed, requirements: kept, dropped };
  const { error } = await db
    .from("tenders")
    .update({
      parsed: result as unknown as NonNullable<Json>,
      status: "parsed",
      client_name: t.client_name ?? parsed.client,
      deadline: t.deadline ?? parsed.deadline,
    })
    .eq("id", t.id);
  if (error) throw fromDbError(error);
  const { data: pack } = await db.from("tender_packs").select("id").eq("tender_id", t.id).maybeSingle();
  if (!pack) {
    const { error: packError } = await db.from("tender_packs").insert({ org_id: t.org_id, tender_id: t.id });
    if (packError) throw fromDbError(packError);
  }
  await refreshMapping(db, t.id);
  return result;
}

async function packWithTender(db: Db, tenderId: string) {
  const { data } = await db.from("tender_packs").select("*, tender:tenders(*)").eq("tender_id", tenderId).maybeSingle();
  if (!data || !data.tender) throw new ServiceError("not_found");
  return { pack: data, tender: data.tender };
}

const requirementsOf = (parsed: unknown) =>
  ((parsed as { requirements?: TenderRequirement[] } | null)?.requirements ?? []) as TenderRequirement[];

/** Step 2: map requirements to stored documents for the chosen vessels (manual mappings kept). */
export async function refreshMapping(db: Db, tenderId: string, vesselIds?: string[]) {
  const { pack, tender } = await packWithTender(db, tenderId);
  const subjects = vesselIds ?? pack.vessel_ids;
  const { data: docs } = await db
    .from("documents_live")
    .select("id, document_type_code, subject_type, subject_id, expiry_date, effective_status")
    .eq("org_id", tender.org_id);
  const prior = pack.items as Items;
  const items: Items = {};
  for (const req of requirementsOf(tender.parsed)) {
    if (prior[req.id]?.manual) {
      items[req.id] = prior[req.id]!;
      continue;
    }
    items[req.id] = mapRequirement(req, TENDER_KEYWORDS, (docs ?? []) as StoredDoc[], subjects, tender.deadline);
  }
  const { error } = await db
    .from("tender_packs")
    .update({ items: items as unknown as NonNullable<Json>, vessel_ids: subjects, status: "draft" })
    .eq("id", pack.id);
  if (error) throw fromDbError(error);
  return items;
}

/** The owner points an unmatched (or wrongly matched) requirement at a stored document. */
export async function mapManually(db: Db, tenderId: string, requirementId: string, documentId: string | null) {
  const { pack } = await packWithTender(db, tenderId);
  const items = { ...(pack.items as Items) };
  const { data: doc } = documentId
    ? await db
        .from("documents_live")
        .select("id, document_type_code, effective_status")
        .eq("id", documentId)
        .maybeSingle()
    : { data: null };
  items[requirementId] = {
    document_id: doc?.id ?? null,
    document_type_code: doc?.document_type_code ?? null,
    status: doc
      ? doc.effective_status === "valid" || doc.effective_status === "expiring"
        ? "valid"
        : "missing"
      : "missing",
    manual: true,
  };
  await db
    .from("tender_packs")
    .update({ items: items as unknown as NonNullable<Json>, status: "draft" })
    .eq("id", pack.id);
}

/** Stored facts the drafts may use (nothing else): company, chosen vessels, current certificates. */
export async function tenderFacts(db: Db, orgId: string, vesselIds: string[]) {
  const [{ data: org }, { data: vessels }, { data: docs }] = await Promise.all([
    db
      .from("orgs")
      .select("name, country_code, registration_number, verification_status, countries(name)")
      .eq("id", orgId)
      .single(),
    vesselIds.length
      ? db
          .from("vessels")
          .select(
            "id, name, type, length_m, year_built, flag_country_code, passenger_capacity, cargo_capacity_t, crew_complement, speed_kn, deck_space_m2, dp_class",
          )
          .in("id", vesselIds)
      : Promise.resolve({ data: [] }),
    db
      .from("documents_live")
      .select("document_type_code, subject_type, subject_id, expiry_date, effective_status")
      .eq("org_id", orgId),
  ]);
  const names = new Map((vessels ?? []).map((v) => [v.id, v.name]));
  return {
    company: {
      name: org?.name,
      country: org?.countries?.name ?? org?.country_code,
      registration_number: org?.registration_number ?? null,
      verified: org?.verification_status === "verified",
    },
    vessels: (vessels ?? []).map(({ id: _id, flag_country_code, ...v }) => ({ ...v, flag: flag_country_code })),
    certificates: (docs ?? [])
      .filter(
        (d) =>
          (d.effective_status === "valid" || d.effective_status === "expiring") &&
          (d.subject_type !== "vessel" || vesselIds.includes(d.subject_id ?? "")),
      )
      .map((d) => ({
        type: d.document_type_code ?? "",
        for: names.get(d.subject_id ?? "") ?? d.subject_type ?? "",
        expires: d.expiry_date,
      })),
  };
}

/** Step 3: one call per section, from facts only; figures not in the facts become [MISSING] markers. */
export async function draftSections(db: Db, tenderId: string) {
  const { pack, tender } = await packWithTender(db, tenderId);
  const facts = await tenderFacts(db, tender.org_id, pack.vessel_ids);
  const requirements = requirementsOf(tender.parsed).map((r) => ({
    id: r.id,
    category: r.category,
    description: r.description,
    mandatory: r.mandatory,
  }));
  const factsJson = JSON.stringify(facts);
  const reqJson = JSON.stringify(requirements);
  const sections: Record<string, string> = { ...(pack.sections as Record<string, string>) };
  const guarded: Record<string, string[]> = {};
  for (const section of SECTIONS) {
    const started = Date.now();
    try {
      const out = await integrations().llm.generateText({
        promptId: TENDER_DRAFT_PROMPT_ID,
        promptVersion: TENDER_DRAFT_PROMPT_VERSION,
        system: "You draft sections of vessel-hire tender responses.",
        messages: [{ role: "user", content: tenderDraftPrompt(section, facts, requirements) }],
      });
      const g = guardDraft(out.text.trim(), factsJson, reqJson);
      sections[section] = g.text;
      guarded[section] = g.replaced;
      await logJob(
        tender.org_id,
        "tender_draft",
        `tender_pack:${pack.id}:${section}`,
        TENDER_DRAFT_PROMPT_VERSION,
        true,
        { model: out.usage.model, tokensIn: out.usage.tokensIn, tokensOut: out.usage.tokensOut },
        started,
      );
    } catch (err) {
      sections[section] = sections[section] ?? "[MISSING: section text]";
      await logJob(
        tender.org_id,
        "tender_draft",
        `tender_pack:${pack.id}:${section}`,
        TENDER_DRAFT_PROMPT_VERSION,
        false,
        { model: null, tokensIn: 0, tokensOut: 0 },
        started,
        err instanceof Error ? err.message.slice(0, 300) : "error",
      );
    }
  }
  await db
    .from("tender_packs")
    .update({ sections: sections as NonNullable<Json>, status: "draft" })
    .eq("id", pack.id);
  await db.from("tenders").update({ status: "in_progress" }).eq("id", tender.id);
  return { sections, guarded };
}

export async function saveSection(db: Db, tenderId: string, section: SectionKey, text: string) {
  const { pack } = await packWithTender(db, tenderId);
  const sections = { ...(pack.sections as Record<string, string>), [section]: text };
  // Any edit needs a fresh review.
  await db
    .from("tender_packs")
    .update({ sections: sections as NonNullable<Json>, status: "draft", reviewed_by: null, reviewed_at: null })
    .eq("id", pack.id);
}

export async function markReviewed(db: Db, me: Me, tenderId: string) {
  const { pack } = await packWithTender(db, tenderId);
  await db
    .from("tender_packs")
    .update({ status: "reviewed", reviewed_by: me.userId, reviewed_at: new Date().toISOString() })
    .eq("id", pack.id);
}

/** "Submit anyway": recorded with who and when (and in the audit log). */
export async function setSubmitAnyway(db: Db, me: Me, tenderId: string, on: boolean) {
  const { pack } = await packWithTender(db, tenderId);
  await db
    .from("tender_packs")
    .update({
      submit_anyway: on,
      submit_anyway_by: on ? me.userId : null,
      submit_anyway_at: on ? new Date().toISOString() : null,
    })
    .eq("id", pack.id);
}

export async function packState(db: Db, tenderId: string) {
  const { pack, tender } = await packWithTender(db, tenderId);
  const requirements = requirementsOf(tender.parsed);
  const blockers = exportBlockers(pack.sections as Record<string, string>, requirements, pack.items as Items);
  return { pack, tender, requirements, blockers };
}

const SECTION_TITLES: Record<SectionKey, string> = {
  cover_letter: "Cover letter",
  company_profile: "Company profile",
  vessel_specification: "Vessel specification",
  hse_statement: "HSE statement",
};
const STATUS_LABEL: Record<ItemStatus, string> = {
  valid: "On file (valid)",
  expires_before_deadline: "On file (expires before the deadline)",
  missing: "MISSING",
  unmatched: "Not mapped",
};

/** Merged PDF (index, sections, attached documents) and a ZIP of the sources. Server checks the rules. */
export async function exportPack(db: Db, me: Me, tenderId: string) {
  const { pack, tender, requirements, blockers } = await packState(db, tenderId);
  if (pack.status !== "reviewed") throw new ServiceError("tender_not_reviewed");
  if (blockers.blocked && !pack.submit_anyway) throw new ServiceError("tender_blocked");
  const items = pack.items as Items;
  const sections = pack.sections as Record<string, string>;
  const admin = supabaseAdmin();

  // Attached documents, in checklist order (each once).
  const docIds = [...new Set(requirements.map((r) => items[r.id]?.document_id).filter((x): x is string => !!x))];
  const { data: docs } = docIds.length
    ? await admin.from("documents").select("id, document_type_code, file_path").in("id", docIds)
    : { data: [] };
  const files: { id: string; title: string; path: string; bytes: Uint8Array; mimeType: string }[] = [];
  for (const d of docs ?? []) {
    if (!d.file_path) continue;
    const { data } = await admin.storage.from(DOCUMENTS_BUCKET).download(d.file_path);
    if (data)
      files.push({
        id: d.id,
        title: d.document_type_code.replace(/_/g, " "),
        path: d.file_path,
        bytes: new Uint8Array(await data.arrayBuffer()),
        mimeType: data.type || (d.file_path.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      });
  }

  const index: PdfBlock[] = [
    { text: tender.title, size: 18, bold: true },
    { text: `${tender.client_name ?? ""}${tender.deadline ? ` · Deadline ${tender.deadline}` : ""}`, size: 10 },
    { text: "Index", size: 14, bold: true, gapBefore: 16 },
    ...SECTIONS.map((s, i) => ({ text: `${i + 1}. ${SECTION_TITLES[s]}`, size: 10 })),
    { text: `${SECTIONS.length + 1}. Requirements checklist`, size: 10 },
    { text: `${SECTIONS.length + 2}. Attached documents (${files.length})`, size: 10 },
    ...(pack.submit_anyway && blockers.blocked
      ? [{ text: "Submitted with open items (owner's decision).", size: 9, gapBefore: 8 }]
      : []),
  ];
  const body: PdfBlock[] = SECTIONS.flatMap((s, i) => [
    { text: `${i + 1}. ${SECTION_TITLES[s]}`, size: 14, bold: true, gapBefore: 20 },
    { text: sections[s] ?? "", size: 10, gapBefore: 4 },
  ]);
  const checklist: PdfBlock[] = [
    { text: `${SECTIONS.length + 1}. Requirements checklist`, size: 14, bold: true, gapBefore: 20 },
    ...requirements.map((r) => ({
      text: `${r.id}${r.mandatory ? " (mandatory)" : ""}: "${r.source_text}"`,
      right: STATUS_LABEL[items[r.id]?.status ?? "unmatched"],
      size: 9,
    })),
  ];
  const base = await renderPdf(
    `Tender response: ${tender.title}`,
    [...index, ...body, ...checklist],
    `${tender.title} · exported ${localDate(new Date(), "UTC")}`,
  );
  const pdf = await appendFiles(base, files);

  const zip = zipSync({
    "tender-pack.pdf": pdf,
    ...Object.fromEntries(SECTIONS.map((s) => [`sections/${s}.txt`, strToU8(sections[s] ?? "")])),
    "checklist.csv": strToU8(
      [
        "id,mandatory,status,requirement",
        ...requirements.map((r) =>
          [r.id, r.mandatory, items[r.id]?.status ?? "unmatched", `"${r.source_text.replace(/"/g, '""')}"`].join(","),
        ),
      ].join("\n"),
    ),
    ...Object.fromEntries(
      files.map((f, i) => [
        `documents/${String(i + 1).padStart(2, "0")}-${f.title.replace(/\s+/g, "-")}.${f.path.split(".").pop()}`,
        f.bytes,
      ]),
    ),
  });

  const base_path = `${tender.org_id}/tenders/${pack.id}`;
  for (const [path, bytes, type] of [
    [`${base_path}.pdf`, pdf, "application/pdf"],
    [`${base_path}.zip`, zip, "application/zip"],
  ] as const) {
    const up = await admin.storage.from(BUSINESS_BUCKET).upload(path, bytes, { contentType: type, upsert: true });
    if (up.error) throw new Error(`tender export: ${up.error.message}`);
  }
  await admin
    .from("tender_packs")
    .update({
      status: "exported",
      export_path: `${base_path}.pdf`,
      zip_path: `${base_path}.zip`,
      exported_by: me.userId,
      exported_at: new Date().toISOString(),
    })
    .eq("id", pack.id);
  await admin.from("tenders").update({ status: "exported" }).eq("id", tender.id);
  return {
    pdfPath: `${base_path}.pdf`,
    zipPath: `${base_path}.zip`,
    bytes: pdf.byteLength,
  };
}
