import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TENDER_KEYWORDS } from "@/config/tender-keywords";
import { tenderDraftPrompt, tenderParseSchema } from "@/server/ai/prompts/tender";
import { devTenderDraft, devTenderParse } from "@/server/integrations/llm/dev-tender";
import {
  exportBlockers,
  guardDraft,
  keepQuoted,
  mapRequirement,
  quoteFound,
  SECTIONS,
  unsupportedFigures,
  type StoredDoc,
  type TenderRequirement,
} from "@/lib/tenders";

const TENDER = readFileSync("tests/fixtures/tender-crew-boat.txt", "utf8");
const req = (over: Partial<TenderRequirement>): TenderRequirement => ({
  id: "R1",
  category: "vessel",
  description: "",
  source_text: "",
  mandatory: true,
  ...over,
});

describe("tender parse: every checklist item quotes the tender", () => {
  const parsed = tenderParseSchema.parse(devTenderParse(TENDER));

  it("finds the requirements and the deadline", () => {
    expect(parsed.deadline).toBe("2027-03-31");
    expect(parsed.requirements.length).toBeGreaterThanOrEqual(8);
  });

  it("keeps only requirements whose quote is in the tender", () => {
    const invented = req({ id: "X1", source_text: "Bidders must hold ISO 9001 certification." });
    const { kept, dropped } = keepQuoted([...parsed.requirements, invented], TENDER);
    expect(dropped).toBe(1);
    expect(kept.every((r) => quoteFound(r.source_text, TENDER))).toBe(true);
  });

  it("matches quotes despite case, spacing and curly quotes; rejects tiny quotes", () => {
    expect(quoteFound("BIDDERS  must provide a copy of a valid hull", TENDER)).toBe(true);
    expect(quoteFound("crew", TENDER)).toBe(false);
  });
});

describe("mapping requirements to stored documents", () => {
  const vessel = "v1";
  const doc = (code: string, expiry: string | null, status = "valid", subject = vessel): StoredDoc => ({
    id: `${code}-${expiry}`,
    document_type_code: code,
    subject_type: "vessel",
    subject_id: subject,
    expiry_date: expiry,
    effective_status: status,
  });
  const docs = [
    doc("insurance", "2028-06-30"),
    doc("class_certificate", "2027-01-15"),
    doc("radio_licence", "2026-01-01", "expired"),
  ];
  const map = (text: string) =>
    mapRequirement(req({ source_text: text, description: text }), TENDER_KEYWORDS, docs, [vessel], "2027-03-31");

  it("green when a valid document outlasts the deadline", () => {
    expect(map("valid hull and machinery insurance policy").status).toBe("valid");
  });
  it("amber when it expires before the deadline", () => {
    expect(map("valid class certificate issued by an IACS member").status).toBe("expires_before_deadline");
  });
  it("red when the only document has expired, or none is held", () => {
    expect(map("valid radio licence for the vessel").status).toBe("missing");
    expect(map("copy of the vessel registration certificate").status).toBe("missing");
  });
  it("grey when no document type matches", () => {
    expect(map("quote a day rate in NGN").status).toBe("unmatched");
  });
  it("ignores documents of vessels not in the bid", () => {
    const other = mapRequirement(
      req({ source_text: "insurance policy" }),
      TENDER_KEYWORDS,
      [doc("insurance", "2028-01-01", "valid", "v2")],
      [vessel],
      null,
    );
    expect(other.status).toBe("missing");
  });
});

describe("drafts use stored facts only", () => {
  const facts = {
    company: { name: "Bonny Crew Boats Ltd", country: "Nigeria", registration_number: null, verified: false },
    vessels: [{ name: "MV Bonny Runner", type: "crew_boat", length_m: 32, year_built: 2014, flag: "NG" }],
    certificates: [{ type: "insurance", for: "MV Bonny Runner", expires: "2028-06-30" }],
  };
  const requirements = [{ id: "R1", category: "vessel", description: "Crew boat of at least 30 m", mandatory: true }];

  it("figures not in the facts become [MISSING] markers", () => {
    const g = guardDraft(
      "We have 12 vessels and 25 years of experience; MV Bonny Runner is 32 m.",
      JSON.stringify(facts),
    );
    expect(g.replaced.sort()).toEqual(["12", "25"]);
    expect(g.text).toContain("[MISSING: confirm 12]");
    expect(g.text).toContain("32 m");
  });

  it("every drafted section (local stand-in) has no unsupported figures after the guard", () => {
    for (const s of SECTIONS) {
      const draft = devTenderDraft(tenderDraftPrompt(s, facts, requirements));
      const g = guardDraft(draft, JSON.stringify(facts), JSON.stringify(requirements));
      expect(unsupportedFigures(g.text, JSON.stringify(facts), JSON.stringify(requirements))).toEqual([]);
    }
  });

  it("missing facts are marked, not invented", () => {
    expect(devTenderDraft(tenderDraftPrompt("company_profile", facts, requirements))).toContain("[MISSING:");
  });
});

describe("export rules", () => {
  const requirements = [req({ id: "R1" }), req({ id: "R2", mandatory: false }), req({ id: "R3" })];

  it("held by [MISSING] markers and red mandatory items", () => {
    const b = exportBlockers({ cover_letter: "Dear [MISSING: name]" }, requirements, {
      R1: { status: "missing", document_id: null },
      R2: { status: "missing", document_id: null },
      R3: { status: "valid", document_id: "d" },
    });
    expect(b.markers).toHaveLength(1);
    expect(b.redMandatory).toEqual(["R1"]);
    expect(b.blocked).toBe(true);
  });

  it("amber items and optional red items don't hold the export", () => {
    const b = exportBlockers({ cover_letter: "Dear Sir" }, requirements, {
      R1: { status: "expires_before_deadline", document_id: "d1" },
      R2: { status: "missing", document_id: null },
      R3: { status: "valid", document_id: "d3" },
    });
    expect(b.blocked).toBe(false);
  });
});
