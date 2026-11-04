import "server-only";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

export interface RuleSetRow {
  id: string;
  countryCode: string | null;
  name: string;
  version: number;
  status: "draft" | "published" | "retired";
  publishedAt: string | null;
  legalReviewNote: string | null;
  requirementCount: number;
}

/** Every rule set version an admin can see, newest first within each country. */
export async function listRuleSets(db: Db): Promise<RuleSetRow[]> {
  const { data, error } = await db
    .from("compliance_rule_sets")
    .select("id, country_code, name, version, status, published_at, legal_review_note, document_requirements(count)")
    .order("country_code", { ascending: true, nullsFirst: true })
    .order("version", { ascending: false });
  if (error) throw fromDbError(error);
  return data.map((r) => ({
    id: r.id,
    countryCode: r.country_code,
    name: r.name,
    version: r.version,
    status: r.status,
    publishedAt: r.published_at,
    legalReviewNote: r.legal_review_note,
    requirementCount: r.document_requirements[0]?.count ?? 0,
  }));
}

export async function getRuleSet(db: Db, id: string) {
  const { data, error } = await db
    .from("compliance_rule_sets")
    .select(
      `id, country_code, name, version, status, published_at, legal_review_note,
       regulators(id, name, short_name, scope),
       document_requirements(id, document_type_code, applies_to, vessel_types, modes, mandatory, regulator:regulators(short_name)),
       charter_eligibility_rules(code, description_key, severity, check),
       safety_rule_defaults(max_wind_kmh, max_gust_kmh, max_wave_m, night_block, permitted_start, permitted_end),
       tax_rules(code, rate_bps, applies_to, label_key)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  return data;
}

export async function publishRuleSet(db: Db, id: string, note?: string): Promise<void> {
  const { error } = await db.rpc("publish_rule_set", { p_id: id, p_note: note });
  if (error) throw fromDbError(error);
}

export async function newRuleSetVersion(db: Db, id: string): Promise<string> {
  const { data, error } = await db.rpc("new_rule_set_version", { p_id: id });
  if (error) throw fromDbError(error);
  return data;
}
