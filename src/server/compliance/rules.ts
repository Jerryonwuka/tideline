import "server-only";
import type { Db } from "@/server/supabase/server";
import { fromDbError } from "@/server/services/errors";
import type { EligibilityRule, Requirement, SafetyThresholds } from "./engine";

/** Anything with an operating country, a type and enabled modes (vessels arrive in M2). */
export interface VesselLike {
  operatingCountryCode: string;
  type: string;
  modes: string[];
}

/** Documents required for a vessel: published global baseline + its country's published rule set. */
export async function requirementsFor(db: Db, vessel: VesselLike): Promise<Requirement[]> {
  const { data, error } = await db.rpc("compliance_requirements", {
    p_country: vessel.operatingCountryCode,
    p_vessel_type: vessel.type,
    p_modes: vessel.modes,
    p_applies_to: "vessel",
  });
  if (error) throw fromDbError(error);
  return data.map((r) => ({
    documentTypeCode: r.document_type_code,
    nameKey: r.name_key,
    appliesTo: r.applies_to,
    mandatory: r.mandatory,
    regulator: r.regulator,
    alertOffsets: r.alert_offsets,
    ruleSet: { id: r.rule_set_id, countryCode: r.rule_set_country, version: r.rule_set_version },
  }));
}

async function publishedRuleSetId(db: Db, countryCode: string): Promise<string | null> {
  const { data, error } = await db
    .from("compliance_rule_sets")
    .select("id")
    .eq("country_code", countryCode)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data?.id ?? null;
}

/** Default safety thresholds for a country; null if its rule set isn't published yet. */
export async function safetyDefaults(db: Db, countryCode: string): Promise<SafetyThresholds | null> {
  const id = await publishedRuleSetId(db, countryCode);
  if (!id) return null;
  const { data, error } = await db.from("safety_rule_defaults").select("*").eq("rule_set_id", id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) return null;
  return {
    maxWindKmh: Number(data.max_wind_kmh),
    maxGustKmh: Number(data.max_gust_kmh),
    maxWaveM: Number(data.max_wave_m),
    nightBlock: data.night_block,
    permittedStart: data.permitted_start?.slice(0, 5) ?? null,
    permittedEnd: data.permitted_end?.slice(0, 5) ?? null,
  };
}

export async function eligibilityRules(db: Db, countryCode: string): Promise<EligibilityRule[]> {
  const id = await publishedRuleSetId(db, countryCode);
  if (!id) return [];
  const { data, error } = await db
    .from("charter_eligibility_rules")
    .select("code, description_key, check, severity")
    .eq("rule_set_id", id);
  if (error) throw fromDbError(error);
  return data.map((r) => ({
    code: r.code,
    descriptionKey: r.description_key,
    check: r.check as EligibilityRule["check"],
    severity: r.severity,
  }));
}
