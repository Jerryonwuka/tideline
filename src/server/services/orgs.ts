import "server-only";
import type { TablesUpdate } from "@/lib/database.types";
import type { CreateOrgInput, UpdateOrgInput } from "@/lib/schemas/orgs";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

/** Creates the org and makes the caller its owner (one transaction, in the database). */
export async function createOrg(db: Db, input: CreateOrgInput): Promise<string> {
  const { data, error } = await db.rpc("create_org", {
    p_name: input.name,
    p_type: input.type,
    p_country_code: input.countryCode,
    p_modes: input.modes,
    p_registration_number: input.registrationNumber,
    p_region: input.region,
    p_address: input.address,
  });
  if (error) throw fromDbError(error);
  return data;
}

export async function getOrg(db: Db, orgId: string) {
  const { data, error } = await db
    .from("orgs")
    .select(
      "id, name, type, country_code, modes, registration_number, region, address, verification_status, created_at",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  return data;
}

export async function updateOrg(db: Db, orgId: string, input: UpdateOrgInput) {
  const patch: TablesUpdate<"orgs"> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.type !== undefined) patch.type = input.type;
  if (input.modes !== undefined) patch.modes = input.modes;
  if (input.registrationNumber !== undefined) patch.registration_number = input.registrationNumber;
  if (input.region !== undefined) patch.region = input.region;
  if (input.address !== undefined) patch.address = input.address;
  const { data, error } = await db.from("orgs").update(patch).eq("id", orgId).select("id").maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
  return getOrg(db, orgId);
}
