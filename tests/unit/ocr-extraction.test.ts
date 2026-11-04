import { describe, expect, it } from "vitest";
import { CONFIDENCE_THRESHOLD, extractDocument, reviewHints } from "@/server/ai/document-extraction";
import { ocrExtractSystemPrompt, type Extraction } from "@/server/ai/prompts/ocr-extract";
import { FakeLlmClient } from "@/server/integrations/llm/fake";
import { FakeOcrClient } from "@/server/integrations/ocr/fake";

// Recorded-style fixtures: what a model returns for a phone photo of a certificate.
const good: Extraction = {
  document_type_code: "insurance",
  number: "P&I/2026/0417",
  issuer: "Lagoon Marine Insurance",
  holder_name: null,
  vessel_name: "MV Lagoon Star",
  issue_date: "2026-06-05",
  expiry_date: "2027-06-04",
  field_confidence: { number: 0.96, issuer: 0.71, issue_date: 0.9, expiry_date: 0.93 },
  date_format_assumed: "DMY",
  notes: null,
};

const context = {
  countryName: "Testland",
  dateOrder: "DMY",
  documentTypes: [{ code: "insurance", name: "Insurance" }],
};
const input = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/jpeg",
  selectedType: "insurance",
  subjectName: "MV Lagoon Star",
  context,
};

describe("extractDocument", () => {
  it("returns validated output on the first try", async () => {
    const llm = new FakeLlmClient().respond("ocr_extract", good);
    const out = await extractDocument({ llm, ocr: new FakeOcrClient() }, input);
    expect(out).toMatchObject({ ok: true, attempts: 1, extraction: { expiry_date: "2027-06-04" } });
  });

  it("retries once with the validation error, then succeeds", async () => {
    let calls = 0;
    const llm = new FakeLlmClient().respond("ocr_extract", () =>
      ++calls === 1 ? { ...good, expiry_date: "04/06/2027" } : good,
    );
    const out = await extractDocument({ llm, ocr: new FakeOcrClient() }, input);
    expect(out).toMatchObject({ ok: true, attempts: 2 });
    expect(llm.calls[1]?.lastUserMessage).toMatch(/previous answer was invalid: expiry_date/);
  });

  it("falls back to manual entry after two invalid answers", async () => {
    const llm = new FakeLlmClient().respond("ocr_extract", { nonsense: true });
    const out = await extractDocument({ llm, ocr: new FakeOcrClient() }, input);
    expect(out).toMatchObject({ ok: false, attempts: 2 });
  });

  it("rejects impossible dates instead of guessing", async () => {
    const llm = new FakeLlmClient().respond("ocr_extract", { ...good, expiry_date: "2027-02-30" });
    expect((await extractDocument({ llm, ocr: new FakeOcrClient() }, input)).ok).toBe(false);
  });
});

describe("prompt", () => {
  it("tells the model the country's date order for numeric dates (day-first here)", () => {
    const prompt = ocrExtractSystemPrompt(context);
    expect(prompt).toContain("read it in the country's usual order (DMY)");
    expect(prompt).toContain("Never guess a date");
    expect(prompt).toContain("insurance (Insurance)");
  });
});

describe("reviewHints (§10.1 rules)", () => {
  const ctx = {
    subjectName: "MV Lagoon Star",
    selectedType: "insurance",
    today: "2026-11-04",
    defaultValidityMonths: 12,
  };

  it("highlights fields below the confidence threshold", () => {
    const hints = reviewHints(good, ctx);
    expect(CONFIDENCE_THRESHOLD).toBe(0.8);
    expect(hints.lowConfidence).toEqual(["issuer"]);
    expect(hints.flags).toEqual([]);
    expect(hints.confidence).toBe(0.71);
  });

  it("never fills a missing expiry: it is highlighted and only suggested from the issue date", () => {
    const hints = reviewHints({ ...good, expiry_date: null }, ctx);
    expect(hints.lowConfidence).toContain("expiry_date");
    expect(hints.flags).toContain("no_expiry");
    expect(hints.suggestedExpiry).toBe("2027-06-04");
  });

  it("flags a name that doesn't match the vessel, an expired date and a different type", () => {
    const hints = reviewHints(
      { ...good, vessel_name: "MV Ocean Pride", expiry_date: "2026-01-01", document_type_code: "load_line" },
      ctx,
    );
    expect(hints.flags).toEqual(["name_mismatch", "expired", "type_mismatch"]);
  });
});
