import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { boardListing, boardListings } from "@/server/services/charter";
import { as, createOrg, createUser, inTx, rejects, sql, type Tx } from "./helpers";

config({ path: [".env.local", ".env"], quiet: true });
const committed = { orgs: [] as string[], users: [] as string[] };

afterAll(async () => {
  for (const id of committed.orgs) await sql`delete from public.orgs where id = ${id}`;
  for (const id of committed.users) await sql`delete from auth.users where id = ${id}`;
  await sql.end();
});

async function setup(tx: Tx) {
  const owner = await createUser(tx, "Owner");
  const ownerOrg = await createOrg(tx, owner.id, "Owner Marine");
  await tx`update public.orgs set modes = '{charter}' where id = ${ownerOrg}`;
  const [v] = await tx`insert into public.vessels (org_id, name, type, operating_country_code, charter_enabled)
                       values (${ownerOrg}, 'MV Supply', 'osv', 'NG', true) returning id`;
  const [other] = await tx`insert into public.vessels (org_id, name, type, operating_country_code, charter_enabled)
                           values (${ownerOrg}, 'MV Other', 'crew_boat', 'NG', true) returning id`;
  const charterer = await createUser(tx, "Charterer");
  const chartererOrg = await createOrg(tx, charterer.id, "Oil Co");
  const outsider = await createUser(tx, "Outsider");
  await createOrg(tx, outsider.id, "Nosy Ltd");
  const [listing] =
    await tx`insert into public.charter_listings (org_id, vessel_id, currency, day_rate_minor, min_rate_minor, min_days, operating_area, status)
                             values (${ownerOrg}, ${v!.id}, 'NGN', 150000000, 120000000, 2, 'Bonny', 'live') returning id`;
  return {
    owner,
    ownerOrg,
    vesselId: v!.id as string,
    otherVesselId: other!.id as string,
    charterer,
    chartererOrg,
    outsider,
    listingId: listing!.id as string,
  };
}

describe("charter requests and quotes", () => {
  it("a charterer requests a listed vessel, gets a quote and accepts it; a charter is created", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const [req] = await as(
        tx,
        s.charterer.id,
        () =>
          tx`insert into public.charter_requests (charterer_org_id, listing_id, requested_by, start_date, end_date, location, purpose)
           values (${s.chartererOrg}, ${s.listingId}, ${s.charterer.id}, '2026-12-01', '2026-12-05', 'Bonny', 'Crew change') returning id, owner_org_id, status`,
      );
      expect(req).toMatchObject({ owner_org_id: s.ownerOrg, status: "open" });

      // Outsiders can't see it; the charterer can't quote it.
      await as(tx, s.outsider.id, async () => {
        expect(await tx`select 1 from public.charter_requests where id = ${req!.id}`).toHaveLength(0);
      });
      await as(tx, s.charterer.id, async () => {
        expect(
          await rejects(
            tx,
            (
              sp,
            ) => sp`insert into public.charter_quotes (owner_org_id, request_id, vessel_id, currency, day_rate_minor, valid_until)
                        values (${s.chartererOrg}, ${req!.id}, ${s.vesselId}, 'NGN', 1, current_date + 7)`,
          ),
        ).toMatch(/row-level security|forbidden/);
      });

      const quotes = await as(tx, s.owner.id, async () => {
        const [a] =
          await tx`insert into public.charter_quotes (owner_org_id, request_id, vessel_id, currency, day_rate_minor, mobilisation_minor, valid_until)
                             values (${s.ownerOrg}, ${req!.id}, ${s.vesselId}, 'NGN', 140000000, 50000000, current_date + 7) returning id`;
        const [b] =
          await tx`insert into public.charter_quotes (owner_org_id, request_id, vessel_id, currency, day_rate_minor, valid_until)
                             values (${s.ownerOrg}, ${req!.id}, ${s.otherVesselId}, 'NGN', 90000000, current_date + 7) returning id`;
        // The owner can't accept on the charterer's behalf.
        expect(await rejects(tx, (sp) => sp`select public.accept_charter_quote(${a!.id})`)).toMatch(/forbidden/);
        return [a!.id as string, b!.id as string];
      });
      const [{ status }] = (await tx`select status from public.charter_requests where id = ${req!.id}`) as unknown as [
        { status: string },
      ];
      expect(status).toBe("quoted");

      const [charter] = await as(tx, s.charterer.id, async () => {
        const [row] = await tx`select public.accept_charter_quote(${quotes[0]!}) as id`;
        return tx`select owner_org_id, charterer_org_id, vessel_id, day_rate_minor, mobilisation_minor, total_value_minor, commission_bps, status, booked_on_platform
                  from public.charters where id = ${row!.id}`;
      });
      expect(charter).toMatchObject({
        owner_org_id: s.ownerOrg,
        charterer_org_id: s.chartererOrg,
        vessel_id: s.vesselId,
        // 5 days × ₦1,400,000 + ₦500,000 mobilisation
        total_value_minor: String(140000000 * 5 + 50000000),
        status: "pending_contract",
        booked_on_platform: true,
      });
      expect(charter!.commission_bps).toBe(500);
      const statuses =
        await tx`select id, status from public.charter_quotes where request_id = ${req!.id} order by status`;
      expect(Object.fromEntries(statuses.map((q) => [q.id, q.status]))).toEqual({
        [quotes[0]!]: "accepted",
        [quotes[1]!]: "declined",
      });
      // Both sides see the charter; nobody edits it directly.
      for (const who of [s.owner.id, s.charterer.id]) {
        await as(tx, who, async () => {
          expect(await tx`select 1 from public.charters where charterer_org_id = ${s.chartererOrg}`).toHaveLength(1);
        });
      }
      await as(tx, s.owner.id, async () => {
        expect(await rejects(tx, (sp) => sp`update public.charters set total_value_minor = 1`)).toMatch(
          /permission denied/,
        );
      });
    }));

  it("expired quotes can't be accepted; quotes need a charter-enabled vessel of the owner", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const [req] = await as(
        tx,
        s.charterer.id,
        () =>
          tx`insert into public.charter_requests (charterer_org_id, listing_id, requested_by, start_date, end_date, location, purpose)
           values (${s.chartererOrg}, ${s.listingId}, ${s.charterer.id}, '2026-12-01', '2026-12-02', 'Bonny', 'Survey') returning id`,
      );
      const [q] = await as(
        tx,
        s.owner.id,
        () =>
          tx`insert into public.charter_quotes (owner_org_id, request_id, vessel_id, currency, day_rate_minor, valid_until)
           values (${s.ownerOrg}, ${req!.id}, ${s.vesselId}, 'NGN', 100000000, current_date) returning id`,
      );
      await tx`update public.charter_quotes set valid_until = current_date - 1 where id = ${q!.id}`;
      await as(tx, s.charterer.id, async () => {
        expect(await rejects(tx, (sp) => sp`select public.accept_charter_quote(${q!.id})`)).toMatch(/quote_expired/);
      });
      await tx`update public.vessels set charter_enabled = false where id = ${s.otherVesselId}`;
      await as(tx, s.owner.id, async () => {
        expect(
          await rejects(
            tx,
            (
              sp,
            ) => sp`insert into public.charter_quotes (owner_org_id, request_id, vessel_id, currency, day_rate_minor, valid_until)
                        values (${s.ownerOrg}, ${req!.id}, ${s.otherVesselId}, 'NGN', 1, current_date + 7)`,
          ),
        ).toMatch(/invalid_subject/);
      });
    }));

  it("a listing can only show documents of its own vessel (or the company)", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const [doc] = await tx`insert into public.documents (org_id, subject_type, subject_id, document_type_code, status)
                             values (${s.ownerOrg}, 'vessel', ${s.otherVesselId}, 'insurance', 'needs_review') returning id`;
      await as(tx, s.owner.id, async () => {
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`update public.charter_listings set public_document_ids = array[${doc!.id}::uuid] where id = ${s.listingId}`,
          ),
        ).toMatch(/invalid_subject/);
      });
    }));
});

describe("public board", () => {
  it("never exposes private documents or the owner's minimum rate", async () => {
    const user = randomUUID();
    await sql`insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
              values (${user}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())`;
    committed.users.push(user);
    const [org] =
      await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
                            values ('Board Marine', 'vessel_owner', 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{charter}') returning id`;
    committed.orgs.push(org!.id as string);
    const [v] = await sql`insert into public.vessels (org_id, name, type, operating_country_code, charter_enabled)
                          values (${org!.id}, 'MV Public', 'osv', 'NG', true) returning id`;
    const [shown] =
      await sql`insert into public.documents (org_id, subject_type, subject_id, document_type_code, number, expiry_date, status)
                              values (${org!.id}, 'vessel', ${v!.id}, 'class_certificate', 'CLASS-SHOWN-1', '2027-06-01', 'valid') returning id`;
    const [hidden] =
      await sql`insert into public.documents (org_id, subject_type, subject_id, document_type_code, number, file_path, expiry_date, status)
                               values (${org!.id}, 'vessel', ${v!.id}, 'insurance', 'SECRET-POLICY-99', null, '2027-01-01', 'valid') returning id`;
    const [listing] =
      await sql`insert into public.charter_listings (org_id, vessel_id, currency, day_rate_minor, min_rate_minor, min_days, operating_area, status, public_document_ids)
                                values (${org!.id}, ${v!.id}, 'NGN', 200000000, 170000000, 1, 'Onne', 'live', array[${shown!.id}::uuid]) returning id`;

    const detail = JSON.stringify(await boardListing(listing!.id as string), (_, x) =>
      typeof x === "bigint" ? x.toString() : x,
    );
    const list = JSON.stringify(await boardListings({ area: "Onne" }), (_, x) =>
      typeof x === "bigint" ? x.toString() : x,
    );
    for (const json of [detail, list]) {
      expect(json).not.toContain(hidden!.id);
      expect(json).not.toContain("insurance");
      expect(json).not.toContain("SECRET-POLICY-99");
      expect(json).not.toContain("170000000");
      expect(json).not.toContain(shown!.id); // ids are never exposed, only type/status/expiry
      expect(json).not.toContain("CLASS-SHOWN-1"); // nor document numbers
    }
    expect(detail).toContain("class_certificate");
    expect(list).toContain("MV Public");
  });
});
