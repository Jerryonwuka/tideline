import "server-only";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { VesselInput } from "@/lib/schemas/fleet";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

const COLUMNS =
  "id, org_id, name, type, registration_no, imo, mmsi, flag_country_code, operating_country_code, year_built, length_m, passenger_capacity, cargo_capacity_t, engine, crew_complement, speed_kn, deck_space_m2, dp_class, status, ferry_enabled, charter_enabled, created_at";

export type Vessel = Awaited<ReturnType<typeof getVessel>>;

/** Modes a vessel runs, as the compliance module expects them. */
export function vesselModes(v: { ferry_enabled: boolean; charter_enabled: boolean }): string[] {
  return [...(v.ferry_enabled ? ["ferry"] : []), ...(v.charter_enabled ? ["charter"] : [])];
}

function toRow(input: Partial<VesselInput>): TablesUpdate<"vessels"> {
  const row: TablesUpdate<"vessels"> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.type !== undefined) row.type = input.type;
  if (input.registrationNo !== undefined) row.registration_no = input.registrationNo;
  if (input.imo !== undefined) row.imo = input.imo;
  if (input.mmsi !== undefined) row.mmsi = input.mmsi;
  if (input.flagCountryCode !== undefined) row.flag_country_code = input.flagCountryCode;
  if (input.operatingCountryCode !== undefined) row.operating_country_code = input.operatingCountryCode;
  if (input.yearBuilt !== undefined) row.year_built = input.yearBuilt;
  if (input.lengthM !== undefined) row.length_m = input.lengthM;
  if (input.passengerCapacity !== undefined) row.passenger_capacity = input.passengerCapacity;
  if (input.cargoCapacityT !== undefined) row.cargo_capacity_t = input.cargoCapacityT;
  if (input.engine !== undefined) row.engine = input.engine;
  if (input.crewComplement !== undefined) row.crew_complement = input.crewComplement;
  if (input.speedKn !== undefined) row.speed_kn = input.speedKn;
  if (input.deckSpaceM2 !== undefined) row.deck_space_m2 = input.deckSpaceM2;
  if (input.dpClass !== undefined) row.dp_class = input.dpClass;
  if (input.status !== undefined) row.status = input.status;
  if (input.ferryEnabled !== undefined) row.ferry_enabled = input.ferryEnabled;
  if (input.charterEnabled !== undefined) row.charter_enabled = input.charterEnabled;
  return row;
}

export async function listVessels(db: Db, orgId: string) {
  const { data, error } = await db.from("vessels").select(COLUMNS).eq("org_id", orgId).order("name");
  if (error) throw fromDbError(error);
  return data;
}

export async function getVessel(db: Db, id: string) {
  const { data, error } = await db.from("vessels").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  return data;
}

/** Flag and operating country default to the org's country. */
export async function createVessel(db: Db, orgId: string, orgCountry: string, input: VesselInput) {
  const row = {
    ...toRow(input),
    org_id: orgId,
    name: input.name,
    type: input.type,
    operating_country_code: input.operatingCountryCode ?? orgCountry,
    flag_country_code: input.flagCountryCode ?? orgCountry,
  } satisfies TablesInsert<"vessels">;
  const { data, error } = await db.from("vessels").insert(row).select(COLUMNS).single();
  if (error) throw fromDbError(error);
  return data;
}

export async function updateVessel(db: Db, id: string, input: Partial<VesselInput>) {
  const { data, error } = await db.from("vessels").update(toRow(input)).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
  return data;
}

export async function deleteVessel(db: Db, id: string) {
  const { data, error } = await db.from("vessels").delete().eq("id", id).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new ServiceError("forbidden");
}

export async function vesselCrew(db: Db, vesselId: string) {
  const { data, error } = await db
    .from("vessel_crew")
    .select("id, from_date, to_date, crew:crew_members(id, full_name, crew_role, phone_e164)")
    .eq("vessel_id", vesselId)
    .is("to_date", null)
    .order("from_date");
  if (error) throw fromDbError(error);
  return data;
}

export async function assignCrew(db: Db, orgId: string, vesselId: string, crewMemberId: string, fromDate?: string) {
  const { data, error } = await db
    .from("vessel_crew")
    .insert({
      org_id: orgId,
      vessel_id: vesselId,
      crew_member_id: crewMemberId,
      ...(fromDate ? { from_date: fromDate } : {}),
    })
    .select("id")
    .single();
  if (error) throw error.code === "23505" ? new ServiceError("already_member") : fromDbError(error);
  return data.id;
}

/** Ends an assignment today (history is kept). */
export async function endAssignment(db: Db, assignmentId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db.from("vessel_crew").update({ to_date: today }).eq("id", assignmentId).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new ServiceError("forbidden");
}
