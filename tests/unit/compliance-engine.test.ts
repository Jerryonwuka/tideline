import { describe, expect, it } from "vitest";
import {
  charterEligibility,
  complianceScore,
  looserThan,
  type Requirement,
  type SafetyThresholds,
} from "@/server/compliance/engine";

const req = (code: string, mandatory = true): Requirement => ({
  documentTypeCode: code,
  nameKey: `documentTypes.${code}`,
  appliesTo: "vessel",
  mandatory,
  regulator: null,
  alertOffsets: null,
  ruleSet: { id: "rs", countryCode: "XX", version: 1 },
});

describe("complianceScore", () => {
  const requirements = [req("insurance"), req("registration"), req("licence"), req("radio", false)];

  it("counts valid and expiring documents against mandatory requirements only", () => {
    const score = complianceScore(requirements, [
      { documentTypeCode: "insurance", status: "valid" },
      { documentTypeCode: "registration", status: "expiring" },
      { documentTypeCode: "radio", status: "valid" },
    ]);
    expect(score).toMatchObject({ valid: 2, required: 3, missing: ["licence"] });
    expect(score.score).toBeCloseTo(2 / 3);
  });

  it("separates expired, awaiting review and missing", () => {
    const score = complianceScore(requirements, [
      { documentTypeCode: "insurance", status: "expired" },
      { documentTypeCode: "registration", status: "needs_review" },
    ]);
    expect(score).toMatchObject({
      valid: 0,
      expired: ["insurance"],
      awaitingReview: ["registration"],
      missing: ["licence"],
    });
  });

  it("a renewed document counts even if an older copy expired", () => {
    const score = complianceScore(
      [req("insurance")],
      [
        { documentTypeCode: "insurance", status: "expired" },
        { documentTypeCode: "insurance", status: "valid" },
      ],
    );
    expect(score.score).toBe(1);
  });

  it("scores 1 when nothing is required", () => {
    expect(complianceScore([req("radio", false)], []).score).toBe(1);
  });
});

describe("charterEligibility", () => {
  const rules = [
    {
      code: "local_registration",
      descriptionKey: "x",
      check: { requires_documents: ["registration_local"] },
      severity: "warn" as const,
    },
    { code: "hard_rule", descriptionKey: "y", check: { requires_documents: ["permit"] }, severity: "block" as const },
  ];

  it("passes when the required documents are valid, otherwise applies the rule's severity", () => {
    const results = charterEligibility(rules, [{ documentTypeCode: "registration_local", status: "valid" }]);
    expect(results).toEqual([
      { code: "local_registration", descriptionKey: "x", missing: [], result: "pass" },
      { code: "hard_rule", descriptionKey: "y", missing: ["permit"], result: "block" },
    ]);
  });
});

describe("looserThan (org safety settings may only be stricter)", () => {
  const defaults: SafetyThresholds = {
    maxWindKmh: 30,
    maxGustKmh: 40,
    maxWaveM: 1,
    nightBlock: true,
    permittedStart: "06:30",
    permittedEnd: "18:30",
  };

  it("accepts equal or stricter values", () => {
    expect(
      looserThan(defaults, { ...defaults, maxWindKmh: 25, permittedStart: "07:00", permittedEnd: "18:00" }),
    ).toEqual([]);
  });

  it("flags every loosened field", () => {
    expect(
      looserThan(defaults, {
        maxWindKmh: 35,
        maxGustKmh: 45,
        maxWaveM: 1.5,
        nightBlock: false,
        permittedStart: "05:00",
        permittedEnd: null,
      }),
    ).toEqual(["maxWindKmh", "maxGustKmh", "maxWaveM", "nightBlock", "permittedStart", "permittedEnd"]);
  });
});
