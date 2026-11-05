import "server-only";
import { getTranslations } from "next-intl/server";
import type { UploadSubject } from "@/components/fleet/upload-form";
import { listCrew } from "@/server/services/crew";
import { documentTypesFor } from "@/server/services/documents";
import { getOrg } from "@/server/services/orgs";
import { listVessels } from "@/server/services/vessels";
import type { Db } from "@/server/supabase/server";

/** Everything a document can be filed against, with the document types valid for each. */
export async function uploadSubjects(db: Db, orgId: string): Promise<UploadSubject[]> {
  const [org, vessels, crew, t] = await Promise.all([
    getOrg(db, orgId),
    listVessels(db, orgId),
    listCrew(db, orgId),
    getTranslations(),
  ]);
  const typeCache = new Map<string, Promise<{ code: string; label: string }[]>>();
  const types = (country: string, appliesTo: "vessel" | "crew" | "org") => {
    const key = `${country}|${appliesTo}`;
    if (!typeCache.has(key)) {
      typeCache.set(
        key,
        documentTypesFor(db, country, appliesTo).then((rows) =>
          rows.map((r) => ({ code: r.code, label: t(r.name_key) })),
        ),
      );
    }
    return typeCache.get(key)!;
  };
  return [
    ...(await Promise.all(
      vessels.map(async (v) => ({
        key: `vessel:${v.id}`,
        type: "vessel" as const,
        id: v.id,
        label: v.name,
        documentTypes: await types(v.operating_country_code, "vessel"),
      })),
    )),
    ...(await Promise.all(
      crew.map(async (c) => ({
        key: `crew:${c.id}`,
        type: "crew" as const,
        id: c.id,
        label: c.full_name,
        documentTypes: await types(org.country_code, "crew"),
      })),
    )),
    {
      key: `org:${org.id}`,
      type: "org" as const,
      id: org.id,
      label: org.name,
      documentTypes: await types(org.country_code, "org"),
    },
  ];
}

/** Names for subjects in lists ("MV Lagoon Star", "Tunde Adeyemi", the company). */
export async function subjectNames(db: Db, orgId: string): Promise<Map<string, string>> {
  const [org, vessels, crew] = await Promise.all([getOrg(db, orgId), listVessels(db, orgId), listCrew(db, orgId)]);
  return new Map([
    ...vessels.map((v) => [v.id, v.name] as const),
    ...crew.map((c) => [c.id, c.full_name] as const),
    [org.id, org.name],
  ]);
}
