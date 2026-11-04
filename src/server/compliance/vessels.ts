import "server-only";
import { listDocuments } from "@/server/services/documents";
import { vesselModes } from "@/server/services/vessels";
import type { Db } from "@/server/supabase/server";
import { complianceScore, type ComplianceScore, type Requirement } from "./engine";
import { requirementsFor } from "./rules";

interface VesselRow {
  id: string;
  name: string;
  type: string;
  operating_country_code: string;
  ferry_enabled: boolean;
  charter_enabled: boolean;
}

export interface VesselCompliance {
  vesselId: string;
  name: string;
  requirements: Requirement[];
  score: ComplianceScore;
}

/** Compliance for each vessel: requirements from the rule sets, scored against current documents. */
export async function fleetCompliance(db: Db, orgId: string, vessels: VesselRow[]): Promise<VesselCompliance[]> {
  const docs = await listDocuments(db, { orgId, subjectType: "vessel" });
  const cache = new Map<string, Promise<Requirement[]>>();
  return Promise.all(
    vessels.map(async (v) => {
      const modes = vesselModes(v);
      const key = `${v.operating_country_code}|${v.type}|${modes.join(",")}`;
      if (!cache.has(key))
        cache.set(key, requirementsFor(db, { operatingCountryCode: v.operating_country_code, type: v.type, modes }));
      const requirements = await cache.get(key)!;
      const held = docs
        .filter((d) => d.subject_id === v.id && d.effective_status && d.document_type_code)
        .map((d) => ({ documentTypeCode: d.document_type_code!, status: d.effective_status! }));
      return { vesselId: v.id, name: v.name, requirements, score: complianceScore(requirements, held) };
    }),
  );
}
