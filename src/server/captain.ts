import "server-only";
import type { MembershipSummary } from "@/server/services/profile";
import type { Db } from "@/server/supabase/server";
import { myCrewId } from "./org-context";

/** Vessels a person can run trips on: all of them for the office, assigned ones for crew. */
export async function myVessels(db: Db, membership: MembershipSummary, userId: string) {
  if (membership.role === "owner" || membership.role === "manager") {
    const { data } = await db
      .from("vessels")
      .select("id, name, passenger_capacity")
      .eq("org_id", membership.orgId)
      .eq("ferry_enabled", true)
      .order("name");
    return data ?? [];
  }
  const crewId = await myCrewId(db, membership.orgId, userId);
  if (!crewId) return [];
  const { data } = await db
    .from("vessel_crew")
    .select("vessel:vessels(id, name, passenger_capacity)")
    .eq("crew_member_id", crewId)
    .is("to_date", null);
  return (data ?? []).flatMap((a) => (a.vessel ? [a.vessel] : []));
}
