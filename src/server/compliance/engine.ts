/**
 * Compliance engine (BUILD_SPEC §16): pure functions over rule data loaded from the PUBLISHED
 * global baseline and country rule set. No country is named in here; everything comes from data.
 */

export type AppliesTo = "vessel" | "crew" | "org";

export interface Requirement {
  documentTypeCode: string;
  nameKey: string;
  appliesTo: AppliesTo;
  mandatory: boolean;
  regulator: string | null;
  alertOffsets: number[] | null;
  ruleSet: { id: string; countryCode: string | null; version: number };
}

/** What we know about a held document when scoring. */
export interface HeldDocument {
  documentTypeCode: string;
  status: "needs_review" | "valid" | "expiring" | "expired" | "rejected";
}

export interface ComplianceScore {
  /** valid mandatory ÷ mandatory, 0–1; 1 when nothing is required. */
  score: number;
  valid: number;
  required: number;
  missing: string[];
  expired: string[];
  awaitingReview: string[];
}

const COUNTS_AS_VALID = new Set<HeldDocument["status"]>(["valid", "expiring"]);

export function complianceScore(requirements: Requirement[], documents: HeldDocument[]): ComplianceScore {
  const mandatory = [...new Set(requirements.filter((r) => r.mandatory).map((r) => r.documentTypeCode))];
  const byType = new Map<string, HeldDocument[]>();
  for (const d of documents) byType.set(d.documentTypeCode, [...(byType.get(d.documentTypeCode) ?? []), d]);

  const missing: string[] = [];
  const expired: string[] = [];
  const awaitingReview: string[] = [];
  let valid = 0;
  for (const code of mandatory) {
    const held = byType.get(code) ?? [];
    if (held.some((d) => COUNTS_AS_VALID.has(d.status))) valid += 1;
    else if (held.some((d) => d.status === "needs_review")) awaitingReview.push(code);
    else if (held.some((d) => d.status === "expired")) expired.push(code);
    else missing.push(code);
  }
  return {
    score: mandatory.length ? valid / mandatory.length : 1,
    valid,
    required: mandatory.length,
    missing,
    expired,
    awaitingReview,
  };
}

export interface EligibilityRule {
  code: string;
  descriptionKey: string;
  check: { requires_documents?: string[] };
  severity: "block" | "warn";
}

export interface EligibilityResult {
  code: string;
  result: "pass" | "warn" | "block";
  descriptionKey: string;
  missing: string[];
}

/** Evaluates a country's charter eligibility rules against the documents a vessel holds. */
export function charterEligibility(rules: EligibilityRule[], documents: HeldDocument[]): EligibilityResult[] {
  const validTypes = new Set(documents.filter((d) => COUNTS_AS_VALID.has(d.status)).map((d) => d.documentTypeCode));
  return rules.map((rule) => {
    const missing = (rule.check.requires_documents ?? []).filter((code) => !validTypes.has(code));
    return {
      code: rule.code,
      descriptionKey: rule.descriptionKey,
      missing,
      result: missing.length ? rule.severity : "pass",
    };
  });
}

export interface SafetyThresholds {
  maxWindKmh: number;
  maxGustKmh: number;
  maxWaveM: number;
  nightBlock: boolean;
  /** "HH:MM" local time at the jetty, or null for no limit. */
  permittedStart: string | null;
  permittedEnd: string | null;
}

/**
 * Org safety settings may only be stricter than the country defaults (§4.2). Returns the fields
 * that would loosen them; empty means the org values are acceptable.
 */
export function looserThan(defaults: SafetyThresholds, org: SafetyThresholds): (keyof SafetyThresholds)[] {
  const problems: (keyof SafetyThresholds)[] = [];
  if (org.maxWindKmh > defaults.maxWindKmh) problems.push("maxWindKmh");
  if (org.maxGustKmh > defaults.maxGustKmh) problems.push("maxGustKmh");
  if (org.maxWaveM > defaults.maxWaveM) problems.push("maxWaveM");
  if (defaults.nightBlock && !org.nightBlock) problems.push("nightBlock");
  if (defaults.permittedStart && (!org.permittedStart || org.permittedStart < defaults.permittedStart))
    problems.push("permittedStart");
  if (defaults.permittedEnd && (!org.permittedEnd || org.permittedEnd > defaults.permittedEnd))
    problems.push("permittedEnd");
  return problems;
}
