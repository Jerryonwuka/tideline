import "server-only";
import type { TablesUpdate } from "@/lib/database.types";
import type { UpdateCountryInput } from "@/lib/schemas/countries";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

export interface CountrySummary {
  code: string;
  name: string;
  defaultCurrency: string;
  defaultLocale: string;
  defaultTimeZone: string;
  phonePrefix: string;
  enabled: boolean;
  launchStatus: "planned" | "validating" | "pilot" | "live";
  dataRegion: "af" | "eu" | "us";
}

const COLUMNS =
  "code, name, default_currency, default_locale, default_time_zone, phone_prefix, enabled, launch_status, data_region";

type CountryRow = {
  code: string;
  name: string;
  default_currency: string;
  default_locale: string;
  default_time_zone: string;
  phone_prefix: string;
  enabled: boolean;
  launch_status: CountrySummary["launchStatus"];
  data_region: CountrySummary["dataRegion"];
};

const toSummary = (c: CountryRow): CountrySummary => ({
  code: c.code,
  name: c.name,
  defaultCurrency: c.default_currency,
  defaultLocale: c.default_locale,
  defaultTimeZone: c.default_time_zone,
  phonePrefix: c.phone_prefix,
  enabled: c.enabled,
  launchStatus: c.launch_status,
  dataRegion: c.data_region,
});

/** Countries an org can be created in. Admins also see disabled ones through RLS, so filter here. */
export async function listEnabledCountries(db: Db): Promise<CountrySummary[]> {
  const { data, error } = await db.from("countries").select(COLUMNS).eq("enabled", true).order("name");
  if (error) throw fromDbError(error);
  return data.map(toSummary);
}

export async function listAllCountries(db: Db): Promise<CountrySummary[]> {
  const { data, error } = await db.from("countries").select(COLUMNS).order("name");
  if (error) throw fromDbError(error);
  return data.map(toSummary);
}

/** Currency, locale, zone and the published rule set summary for a country (§6). */
export async function countryConfig(db: Db, code: string) {
  const [country, ruleSet] = await Promise.all([
    db.from("countries").select(COLUMNS).eq("code", code).maybeSingle(),
    db
      .from("compliance_rule_sets")
      .select("id, name, version, published_at, document_requirements(count), regulators(short_name)")
      .eq("country_code", code)
      .eq("status", "published")
      .maybeSingle(),
  ]);
  if (country.error) throw fromDbError(country.error);
  if (!country.data) throw new ServiceError("not_found");
  if (ruleSet.error) throw fromDbError(ruleSet.error);
  const rs = ruleSet.data;
  return {
    ...toSummary(country.data),
    ruleSet: rs
      ? {
          id: rs.id,
          name: rs.name,
          version: rs.version,
          publishedAt: rs.published_at,
          requirementCount: rs.document_requirements[0]?.count ?? 0,
          regulators: rs.regulators.map((r) => r.short_name),
        }
      : null,
  };
}

export async function updateCountry(db: Db, code: string, input: UpdateCountryInput): Promise<CountrySummary> {
  const patch: TablesUpdate<"countries"> = {};
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.launchStatus !== undefined) patch.launch_status = input.launchStatus;
  if (input.defaultCurrency !== undefined) patch.default_currency = input.defaultCurrency;
  if (input.defaultLocale !== undefined) patch.default_locale = input.defaultLocale;
  if (input.defaultTimeZone !== undefined) patch.default_time_zone = input.defaultTimeZone;
  const { data, error } = await db.from("countries").update(patch).eq("code", code).select(COLUMNS).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
  return toSummary(data);
}
