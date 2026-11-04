import { afterAll, describe, expect, it } from "vitest";
import { as, createUser, inTx, rejects, sql, type Tx } from "./helpers";

afterAll(async () => {
  await sql.end();
});

// ZZ "Testland" exists only to catch hard-coded Nigerian values. It is disabled; tests enable it
// inside their transaction (as the database owner, bypassing the readiness guard's update path).
async function enableTestland(tx: Tx) {
  await tx`alter table public.countries disable trigger countries_guard`;
  await tx`update public.countries set enabled = true where code = 'ZZ'`;
  await tx`alter table public.countries enable trigger countries_guard`;
}

async function makeAdmin(tx: Tx) {
  const admin = await createUser(tx, "Admin");
  await tx`insert into public.platform_admins (user_id) values (${admin.id})`;
  return admin;
}

const ngRuleSet = async (tx: Tx) =>
  (await tx`select id from public.compliance_rule_sets where country_code = 'NG' and version = 1`)[0]!.id as string;

async function requirementCodes(tx: Tx, country: string, modes: string[], vesselType = "ferry") {
  const rows =
    await tx`select document_type_code from public.compliance_requirements(${country}, ${vesselType}, ${modes})`;
  return rows.map((r) => r.document_type_code as string).sort();
}

describe("countries and org defaults", () => {
  it("an NG org gets NGN, Africa/Lagos and en-NG; a ZZ org gets USD and its own zone", () =>
    inTx(async (tx) => {
      await enableTestland(tx);
      const owner = await createUser(tx, "Owner");
      const [ng] = await as(
        tx,
        owner.id,
        () => tx`select public.create_org('Lagos Org', 'ferry_operator', 'NG', array['ferry']) as id`,
      );
      const [zz] = await as(
        tx,
        owner.id,
        () => tx`select public.create_org('Test Org', 'vessel_owner', 'ZZ', array['charter']) as id`,
      );
      const rows =
        await tx`select country_code, currency, time_zone, default_locale, data_region from public.orgs where id in (${ng!.id}, ${zz!.id}) order by country_code`;
      expect(rows).toEqual([
        { country_code: "NG", currency: "NGN", time_zone: "Africa/Lagos", default_locale: "en-NG", data_region: "af" },
        { country_code: "ZZ", currency: "USD", time_zone: "America/Chicago", default_locale: "fr", data_region: "us" },
      ]);
    }));

  it("orgs cannot be created in a disabled country, and owners cannot move country", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      await as(tx, owner.id, async () => {
        expect(
          await rejects(tx, (sp) => sp`select public.create_org('Test Org', 'vessel_owner', 'ZZ', array['charter'])`),
        ).toMatch(/invalid_country/);
        const [org] = await tx`select public.create_org('Lagos Org', 'ferry_operator', 'NG', array['ferry']) as id`;
        expect(await rejects(tx, (sp) => sp`update public.orgs set country_code = 'ZZ' where id = ${org!.id}`)).toMatch(
          /admin_only_field/,
        );
        // Currency and time zone are the owner's call; an unknown zone is refused.
        expect(await tx`update public.orgs set currency = 'USD' where id = ${org!.id} returning id`).toHaveLength(1);
        expect(
          await rejects(tx, (sp) => sp`update public.orgs set time_zone = 'Mars/Base' where id = ${org!.id}`),
        ).toMatch(/invalid_time_zone/);
      });
    }));

  it("a country cannot be switched on before it has published rules", () =>
    inTx(async (tx) => {
      const admin = await makeAdmin(tx);
      await as(tx, admin.id, async () => {
        expect(await rejects(tx, (sp) => sp`update public.countries set enabled = true where code = 'ZZ'`)).toMatch(
          /country_not_ready/,
        );
      });
    }));

  it("everyone reads enabled countries; only admins see disabled ones or change them", () =>
    inTx(async (tx) => {
      const user = await createUser(tx, "User");
      const admin = await makeAdmin(tx);
      await as(tx, null, async () => {
        expect((await tx`select code from public.countries`).map((r) => r.code)).toEqual(["NG"]);
      });
      await as(tx, user.id, async () => {
        expect(
          await tx`update public.countries set launch_status = 'live' where code = 'NG' returning code`,
        ).toHaveLength(0);
      });
      await as(tx, admin.id, async () => {
        expect((await tx`select code from public.countries order by code`).map((r) => r.code)).toEqual(["NG", "ZZ"]);
        expect(
          await tx`update public.countries set launch_status = 'live' where code = 'NG' returning code`,
        ).toHaveLength(1);
      });
    }));
});

describe("compliance requirements", () => {
  it("only global types apply while the NG rule set is still a draft, and always for ZZ", () =>
    inTx(async (tx) => {
      expect(await requirementCodes(tx, "NG", ["ferry"])).toEqual(["insurance"]);
      expect(await requirementCodes(tx, "ZZ", ["charter"])).toEqual(["insurance"]);
    }));

  it("after publishing, NG vessels get NG requirements for their modes; ZZ still only global", () =>
    inTx(async (tx) => {
      const admin = await makeAdmin(tx);
      const id = await ngRuleSet(tx);
      await as(tx, admin.id, () => tx`select public.publish_rule_set(${id}, 'Reviewed in test')`);

      expect(await requirementCodes(tx, "NG", ["ferry"])).toEqual([
        "insurance",
        "laswa_licence",
        "safety_equipment",
        "vessel_registration",
      ]);
      expect(await requirementCodes(tx, "NG", ["charter"])).toEqual([
        "cabotage_registration",
        "insurance",
        "nimasa_certificate",
        "safety_equipment",
        "vessel_registration",
      ]);
      expect(await requirementCodes(tx, "ZZ", ["ferry", "charter"])).toEqual(["insurance"]);
    }));

  it("rule sets are versioned and only the published version is used", () =>
    inTx(async (tx) => {
      const admin = await makeAdmin(tx);
      const v1 = await ngRuleSet(tx);
      await as(tx, admin.id, async () => {
        await tx`select public.publish_rule_set(${v1})`;
        const [row] = await tx`select public.new_rule_set_version(${v1}) as id`;
        const v2 = row!.id as string;
        // A draft change has no effect until published.
        await tx`insert into public.document_requirements (rule_set_id, document_type_code, applies_to, modes) values (${v2}, 'radio_licence', 'vessel', '{ferry}')`;
        const draft =
          await tx`select document_type_code from public.compliance_requirements('NG', 'ferry', array['ferry'])`;
        expect(draft.map((r) => r.document_type_code)).not.toContain("radio_licence");

        await tx`select public.publish_rule_set(${v2})`;
        const live =
          await tx`select document_type_code, rule_set_version from public.compliance_requirements('NG', 'ferry', array['ferry'])`;
        expect(live.map((r) => r.document_type_code)).toContain("radio_licence");
        expect(new Set(live.filter((r) => r.rule_set_version !== 1).map((r) => r.rule_set_version))).toEqual(
          new Set([2]),
        );
        const statuses =
          await tx`select version, status from public.compliance_rule_sets where country_code = 'NG' order by version`;
        expect(statuses).toEqual([
          { version: 1, status: "retired" },
          { version: 2, status: "published" },
        ]);
        // Published versions are frozen: edits through the API silently match nothing.
        expect(await tx`delete from public.document_requirements where rule_set_id = ${v2} returning id`).toHaveLength(
          0,
        );
      });
    }));

  it("non-admins cannot publish or see drafts", () =>
    inTx(async (tx) => {
      const user = await createUser(tx, "User");
      const id = await ngRuleSet(tx);
      await as(tx, user.id, async () => {
        expect(await rejects(tx, (sp) => sp`select public.publish_rule_set(${id})`)).toMatch(/forbidden/);
        expect(await tx`select id from public.compliance_rule_sets where id = ${id}`).toHaveLength(0);
        expect(await tx`select id from public.document_requirements where rule_set_id = ${id}`).toHaveLength(0);
      });
    }));
});
