import { afterAll, describe, expect, it } from "vitest";
import { addMember, as, createOrg, createUser, inTx, recordCheck, rejects, sql, type Tx } from "./helpers";

// M16 §12: hardening and data-protection rules enforced by the database.

afterAll(async () => {
  await sql.end();
});

/** A ferry trip that departed long ago, with a manifest, a ticket and GPS positions. */
async function oldTrip(
  tx: Tx,
  orgId: string,
  monthsAgo: number,
  passenger = { name: "Ada Obi", phone: "+2348030000001" },
) {
  const [v] =
    await tx`insert into public.vessels (org_id, name, type, operating_country_code, passenger_capacity, ferry_enabled)
                       values (${orgId}, 'MV Old', 'ferry', 'NG', 10, true) returning id`;
  const [j1, j2] = await tx`select id from public.jetties order by name limit 2`;
  const [r] =
    await tx`insert into public.routes (org_id, origin_jetty_id, destination_jetty_id, duration_min, base_fare_minor, currency)
                       values (${orgId}, ${j1!.id}, ${j2!.id}, 45, 150000, 'NGN') returning id`;
  const [t] = await tx`insert into public.trips (org_id, vessel_id, route_id, currency, scheduled_departure)
                       values (${orgId}, ${v!.id}, ${r!.id}, 'NGN', now()) returning id`;
  await recordCheck(tx, orgId, t!.id as string);
  const [m] =
    await tx`insert into public.manifest_entries (org_id, trip_id, full_name, phone_e164, next_of_kin_phone, seats)
                       values (${orgId}, ${t!.id}, ${passenger.name}, ${passenger.phone}, '+2348030000002', 1) returning id`;
  const [k] =
    await tx`insert into public.tickets (org_id, trip_id, buyer_name, buyer_phone, qty, unit_price_minor, platform_fee_minor, total_minor, currency, fee_bearer, channel, code, status)
                       values (${orgId}, ${t!.id}, ${passenger.name}, ${passenger.phone}, 1, 100, 0, 100, 'NGN', 'passenger', 'online', ${`P${Math.random().toString(36).slice(2, 9).toUpperCase()}`}, 'paid') returning id`;
  await tx`update public.trips set lifejackets_confirmed = true, status = 'departed' where id = ${t!.id}`;
  const when = new Date(Date.now() - monthsAgo * 31 * 86_400_000).toISOString();
  await tx`update public.trips set actual_departure = ${when}, scheduled_departure = ${when} where id = ${t!.id}`;
  await tx`insert into public.trip_positions (org_id, trip_id, recorded_at, lat, lng, client_id) values (${orgId}, ${t!.id}, ${when}, 6.45, 3.39, ${`pos-${t!.id}`})`;
  return { tripId: t!.id as string, manifestId: m!.id as string, ticketId: k!.id as string };
}

describe("hardening", () => {
  it("no app role can TRUNCATE (it bypasses row-level security)", async () => {
    const rows = await sql`select table_name, grantee from information_schema.role_table_grants
                           where table_schema = 'public' and privilege_type = 'TRUNCATE' and grantee in ('anon', 'authenticated')`;
    expect(rows).toEqual([]);
  });

  it("row-level security is on for every public table", async () => {
    const rows = await sql`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`;
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it("server-only functions can't be called by app roles", () =>
    inTx(async (tx) => {
      const u = await createUser(tx);
      await as(tx, u.id, async () => {
        for (const call of [
          (sp: Tx) => sp`select public.anonymise_trips_before(gen_random_uuid(), now())`,
          (sp: Tx) => sp`select public.erase_person(gen_random_uuid(), '', '')`,
          (sp: Tx) => sp`select public.hit_rate_limit('x', 1, 60)`,
        ]) {
          expect(await rejects(tx, call)).toMatch(/permission denied/);
        }
      });
    }));

  it("the redaction bypass can't be switched on from a session", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx);
      const org = await createOrg(tx, owner.id);
      const t = await oldTrip(tx, org, 1);
      await as(tx, owner.id, async () => {
        await tx`select set_config('tideline.redact', 'on', true)`;
        expect(
          await rejects(
            tx,
            (sp) => sp`update public.manifest_entries set full_name = 'Changed' where id = ${t.manifestId}`,
          ),
        ).toMatch(/manifest_locked/);
      });
    }));

  it("rate limit: allowed up to the limit, then refused within the window", () =>
    inTx(async (tx) => {
      const results = [];
      for (let i = 0; i < 4; i++)
        results.push((await tx`select public.hit_rate_limit('test:abc', 3, 60) as ok`)[0]!.ok);
      expect(results).toEqual([true, true, true, false]);
      await tx`update public.rate_limits set window_start = now() - interval '2 minutes' where key = 'test:abc'`;
      expect((await tx`select public.hit_rate_limit('test:abc', 3, 60) as ok`)[0]!.ok).toBe(true);
    }));
});

describe("retention and erasure", () => {
  it("retention anonymises old manifests and tickets, deletes old positions, and redacts audit snapshots", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx);
      const org = await createOrg(tx, owner.id);
      const old = await oldTrip(tx, org, 30);
      const recent = await oldTrip(tx, org, 2, { name: "Bola Ade", phone: "+2348030000003" });
      const [res] = await tx`select public.anonymise_trips_before(${org}, now() - interval '24 months') as r`;
      expect(res!.r).toMatchObject({ manifest_entries: 1, tickets: 1, positions: 1 });
      const [m] =
        await tx`select full_name, phone_e164, next_of_kin_phone from public.manifest_entries where id = ${old.manifestId}`;
      expect(m).toEqual({ full_name: "[anonymised]", phone_e164: null, next_of_kin_phone: null });
      const [k] = await tx`select buyer_name, buyer_phone from public.tickets where id = ${old.ticketId}`;
      expect(k).toEqual({ buyer_name: "[anonymised]", buyer_phone: null });
      expect(await tx`select id from public.trip_positions where trip_id = ${old.tripId}`).toHaveLength(0);
      const audits =
        await tx`select before::text as b, after::text as a from public.audit_logs where entity_id = ${old.manifestId}`;
      expect(audits.length).toBeGreaterThan(0);
      for (const a of audits) expect(`${a.b} ${a.a}`).not.toContain("Ada Obi");
      // Newer trips are untouched.
      const [r] = await tx`select full_name from public.manifest_entries where id = ${recent.manifestId}`;
      expect(r!.full_name).toBe("Bola Ade");
      expect(await tx`select id from public.trip_positions where trip_id = ${recent.tripId}`).toHaveLength(1);
      // Audit rows stay append-only for everyone else.
      expect(
        await rejects(tx, (sp) => sp`update public.audit_logs set action = 'x' where entity_id = ${old.manifestId}`),
      ).toMatch(/append_only/);
    }));

  it("erasure blanks the person as passenger and buyer, clears references and removes consents", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx);
      const org = await createOrg(tx, owner.id);
      const person = await createUser(tx, "Leaving Person");
      const t = await oldTrip(tx, org, 1, { name: "Leaving Person", phone: person.phone });
      await tx`insert into public.consents (user_id, purpose, granted, notice_version, source) values (${person.id}, 'marketing', true, 'v', 'test')`;
      await tx`insert into public.crew_members (org_id, user_id, full_name, crew_role) values (${org}, ${person.id}, 'Leaving Person', 'deckhand')`;
      await tx`select public.erase_person(${person.id}, ${person.phone}, 'hash')`;
      const [m] = await tx`select full_name, phone_e164 from public.manifest_entries where id = ${t.manifestId}`;
      expect(m).toEqual({ full_name: "[erased]", phone_e164: null });
      const [k] = await tx`select buyer_name, buyer_phone from public.tickets where id = ${t.ticketId}`;
      expect(k).toEqual({ buyer_name: "[erased]", buyer_phone: null });
      expect(await tx`select id from public.consents where user_id = ${person.id}`).toHaveLength(0);
      expect(await tx`select id from public.crew_members where user_id = ${person.id}`).toHaveLength(0);
      // The account itself can now be deleted without foreign-key errors.
      await tx`delete from auth.users where id = ${person.id}`;
    }));
});

describe("consents, requests, flags and admin access", () => {
  it("consents are append-only and private to the person", () =>
    inTx(async (tx) => {
      const a = await createUser(tx);
      const b = await createUser(tx);
      const [c] =
        await tx`insert into public.consents (user_id, purpose, granted, notice_version, source) values (${a.id}, 'marketing', true, 'v', 'test') returning id`;
      await as(tx, b.id, async () => {
        expect(await tx`select id from public.consents where id = ${c!.id}`).toHaveLength(0);
      });
      await as(tx, a.id, async () => {
        expect(await tx`select id from public.consents where id = ${c!.id}`).toHaveLength(1);
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`insert into public.consents (user_id, purpose, granted, notice_version, source) values (${a.id}, 'marketing', false, 'v', 'x')`,
          ),
        ).toMatch(/permission denied/);
      });
      expect(await rejects(tx, (sp) => sp`update public.consents set granted = false where id = ${c!.id}`)).toMatch(
        /append_only/,
      );
    }));

  it("people request for themselves only, one open request per kind, and can't close them", () =>
    inTx(async (tx) => {
      const a = await createUser(tx);
      const b = await createUser(tx);
      await as(tx, a.id, async () => {
        const [r] =
          await tx`insert into public.data_requests (user_id, kind) values (${a.id}, 'export') returning id, due_at, status`;
        expect(r!.status).toBe("pending");
        expect(new Date(r!.due_at as string).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
        expect(
          await rejects(tx, (sp) => sp`insert into public.data_requests (user_id, kind) values (${a.id}, 'export')`),
        ).toMatch(/duplicate key/);
        expect(
          await rejects(tx, (sp) => sp`insert into public.data_requests (user_id, kind) values (${b.id}, 'delete')`),
        ).toMatch(/row-level security/);
        expect(
          await rejects(tx, (sp) => sp`update public.data_requests set status = 'completed' where id = ${r!.id}`),
        ).toMatch(/permission denied/);
      });
      await as(tx, b.id, async () => {
        expect(await tx`select id from public.data_requests where user_id = ${a.id}`).toHaveLength(0);
      });
    }));

  it("only platform admins switch feature flags; the change is stamped and audited", () =>
    inTx(async (tx) => {
      const u = await createUser(tx);
      const admin = await createUser(tx, "Admin");
      await tx`insert into public.platform_admins (user_id) values (${admin.id})`;
      await as(tx, u.id, async () => {
        const r = await tx`update public.feature_flags set enabled = false where key = 'phase3' returning key`;
        expect(r).toHaveLength(0);
      });
      await as(tx, admin.id, async () => {
        await tx`update public.feature_flags set enabled = true where key = 'phase3'`;
      });
      const [f] = await tx`select enabled, updated_by from public.feature_flags where key = 'phase3'`;
      expect(f).toEqual({ enabled: true, updated_by: admin.id });
      expect(
        await tx`select id from public.audit_logs where entity = 'feature_flag' and actor_user_id = ${admin.id}`,
      ).toHaveLength(1);
    }));

  it("admin reads of passenger data need a reason and are logged", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx);
      const org = await createOrg(tx, owner.id);
      const captain = await createUser(tx);
      await addMember(tx, org, captain.id, "captain");
      const admin = await createUser(tx, "Admin");
      await tx`insert into public.platform_admins (user_id) values (${admin.id})`;
      const t = await oldTrip(tx, org, 1);
      await as(tx, owner.id, async () => {
        expect(
          await rejects(tx, (sp) => sp`select * from public.admin_read_manifest(${t.tripId}, 'Checking a complaint')`),
        ).toMatch(/forbidden/);
      });
      await as(tx, admin.id, async () => {
        expect(await rejects(tx, (sp) => sp`select * from public.admin_read_manifest(${t.tripId}, 'because')`)).toMatch(
          /reason_required/,
        );
        const rows = await tx`select * from public.admin_read_manifest(${t.tripId}, 'Police request ref 123')`;
        expect(rows.map((r) => r.full_name)).toEqual(["Ada Obi"]);
        const [log] =
          await tx`select admin_user_id, reason, rows_returned from public.admin_access_logs where subject_id = ${t.tripId}`;
        expect(log).toEqual({ admin_user_id: admin.id, reason: "Police request ref 123", rows_returned: 1 });
        expect(
          await rejects(tx, (sp) => sp`delete from public.admin_access_logs where subject_id = ${t.tripId}`),
        ).toMatch(/append_only|permission denied/);
      });
      await as(tx, owner.id, async () => {
        expect(await tx`select id from public.admin_access_logs`).toHaveLength(0);
      });
    }));
});
