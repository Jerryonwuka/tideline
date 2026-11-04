import "server-only";
import type { TablesUpdate } from "@/lib/database.types";
import { toE164 } from "@/lib/phone";
import type { CrewInput } from "@/lib/schemas/fleet";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

const COLUMNS =
  "id, org_id, user_id, full_name, phone_e164, crew_role, emergency_contact_name, emergency_contact_phone, status, created_at";

/** Phones are stored as E.164, read with the org's country as default (CLAUDE.md rule 4). */
function phone(input: string | undefined, country: string): string | null | undefined {
  if (input === undefined) return undefined;
  if (!input) return null;
  const e164 = toE164(input, country);
  if (!e164) throw new ServiceError("invalid_phone");
  return e164;
}

export async function listCrew(db: Db, orgId: string) {
  const { data, error } = await db
    .from("crew_members")
    .select(`${COLUMNS}, vessel_crew(vessel:vessels(id, name), to_date)`)
    .eq("org_id", orgId)
    .order("full_name");
  if (error) throw fromDbError(error);
  return data.map((c) => ({
    ...c,
    vessels: c.vessel_crew.filter((a) => a.to_date === null && a.vessel).map((a) => a.vessel!),
  }));
}

export async function getCrewMember(db: Db, id: string) {
  const { data, error } = await db.from("crew_members").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  return data;
}

export async function createCrewMember(db: Db, orgId: string, country: string, input: CrewInput) {
  const { data, error } = await db
    .from("crew_members")
    .insert({
      org_id: orgId,
      full_name: input.fullName,
      crew_role: input.crewRole,
      phone_e164: phone(input.phone, country) ?? null,
      emergency_contact_name: input.emergencyContactName ?? null,
      emergency_contact_phone: phone(input.emergencyContactPhone, country) ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw fromDbError(error);
  return data;
}

export async function updateCrewMember(
  db: Db,
  id: string,
  country: string,
  input: Partial<CrewInput> & { status?: "active" | "inactive" },
) {
  const patch: TablesUpdate<"crew_members"> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.crewRole !== undefined) patch.crew_role = input.crewRole;
  if (input.status !== undefined) patch.status = input.status;
  const p = phone(input.phone, country);
  if (p !== undefined) patch.phone_e164 = p;
  if (input.emergencyContactName !== undefined) patch.emergency_contact_name = input.emergencyContactName;
  const ep = phone(input.emergencyContactPhone, country);
  if (ep !== undefined) patch.emergency_contact_phone = ep;
  const { data, error } = await db.from("crew_members").update(patch).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
  return data;
}

export async function deleteCrewMember(db: Db, id: string) {
  const { data, error } = await db.from("crew_members").delete().eq("id", id).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new ServiceError("forbidden");
}
