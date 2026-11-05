import "server-only";
import { ServiceError } from "@/server/services/errors";
import type { Db } from "@/server/supabase/server";

/** Country, currency and time zone of an org the caller can see (RLS). */
export async function orgBasics(db: Db, orgId: string) {
  const { data } = await db
    .from("orgs")
    .select("id, country_code, currency, time_zone, default_locale, settings")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) throw new ServiceError("not_found");
  return data;
}

/** The caller's own crew record in an org, if they are crew (captains run trips as themselves). */
export async function myCrewId(db: Db, orgId: string, userId: string): Promise<string | null> {
  const { data } = await db
    .from("crew_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data?.id ?? null;
}
