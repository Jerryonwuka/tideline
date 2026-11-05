import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { reconcilePayments } from "@/server/services/payments";
import { as, createOrg, createUser, inTx, recordCheck, rejects, sql, type Tx } from "./helpers";

// The job uses the service-role client against the real database (committed rows, cleaned up after).
config({ path: [".env.local", ".env"], quiet: true });

const cleanup = { orgs: [] as string[], users: [] as string[] };

afterAll(async () => {
  for (const id of cleanup.orgs) await sql`delete from public.orgs where id = ${id}`;
  for (const id of cleanup.users) await sql`delete from auth.users where id = ${id}`;
  await sql.end();
});

async function ferryOrg(tx: Tx) {
  const owner = await createUser(tx, "Owner");
  const orgId = await createOrg(tx, owner.id);
  const [v] =
    await tx`insert into public.vessels (org_id, name, type, operating_country_code, passenger_capacity, ferry_enabled)
                       values (${orgId}, 'MV Bill', 'ferry', 'NG', 3, true) returning id`;
  const [j1, j2] = await tx`select id from public.jetties order by name limit 2`;
  const [r] =
    await tx`insert into public.routes (org_id, origin_jetty_id, destination_jetty_id, duration_min, base_fare_minor, currency)
                       values (${orgId}, ${j1!.id}, ${j2!.id}, 40, 150000, 'NGN') returning id`;
  const [t] =
    await tx`insert into public.trips (org_id, vessel_id, route_id, currency, scheduled_departure, lifejackets_confirmed)
                       values (${orgId}, ${v!.id}, ${r!.id}, 'NGN', now(), true) returning id`;
  return { owner, orgId, vesselId: v!.id as string, routeId: r!.id as string, tripId: t!.id as string };
}

describe("tickets, payments and billing", () => {
  it("only the server writes payments, tickets and the ledger; the ledger is append-only", () =>
    inTx(async (tx) => {
      const s = await ferryOrg(tx);
      await as(tx, s.owner.id, async () => {
        expect(
          await rejects(
            tx,
            (
              sp,
            ) => sp`insert into public.payments (org_id, purpose, reference_type, reference_id, provider, provider_ref, currency, amount_minor, status)
                        values (${s.orgId}, 'ticket', 'ticket', ${randomUUID()}, 'cash', 'X1', 'NGN', 100, 'success')`,
          ),
        ).toMatch(/permission denied/);
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`select public.reserve_ticket(${s.tripId}, 1, 'Ada', '', 'AAAA2222', 'online', 150000, 3750, 153750, 'NGN', 'passenger', 15)`,
          ),
        ).toMatch(/permission denied/);
      });
      const [entry] = await tx`insert into public.ledger_entries (org_id, account, currency, credit_minor, memo)
                               values (${s.orgId}, 'payee_payable', 'NGN', 100, 'test') returning id`;
      await tx.unsafe("set local role service_role");
      expect(
        await rejects(tx, (sp) => sp`update public.ledger_entries set credit_minor = 1 where id = ${entry!.id}`),
      ).toMatch(/permission denied/);
      expect(await rejects(tx, (sp) => sp`delete from public.ledger_entries where id = ${entry!.id}`)).toMatch(
        /permission denied/,
      );
      await tx.unsafe("reset role");
    }));

  it("seat holds count against capacity, so online sales never oversell", () =>
    inTx(async (tx) => {
      const s = await ferryOrg(tx);
      const reserve = (sp: Tx, qty: number, code: string) =>
        sp`select (public.reserve_ticket(${s.tripId}, ${qty}, 'Ada', '', ${code}, 'online', 150000, 3750, ${150000 * qty}, 'NGN', 'passenger', 15)).id`;
      await reserve(tx, 2, "AAAA2222");
      expect(await rejects(tx, (sp) => reserve(sp, 2, "BBBB3333"))).toMatch(/capacity_exceeded/);
      await reserve(tx, 1, "CCCC4444");
      // An expired hold frees its seats.
      await tx`update public.tickets set reserved_until = now() - interval '1 minute' where code = 'AAAA2222'`;
      await reserve(tx, 2, "DDDD5555");
      expect(
        await rejects(
          tx,
          (sp) =>
            sp`select public.reserve_ticket(${s.tripId}, 1, 'Ada', '', 'EEEE6666', 'online', 150000, 0, 150000, 'USD', 'passenger', 15)`,
        ),
      ).toMatch(/capacity_exceeded|currency_mismatch/);
    }));

  it("a lapsed subscription makes fleet edits read-only but trips, manifests and safety keep working", () =>
    inTx(async (tx) => {
      const s = await ferryOrg(tx);
      await tx`insert into public.subscriptions (org_id, plan_code, currency, amount_minor, status, period_end)
               values (${s.orgId}, 'ferry_basic', 'NGN', 3000000, 'read_only', now() - interval '10 days')`;
      await as(tx, s.owner.id, async () => {
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`insert into public.vessels (org_id, name, type, operating_country_code) values (${s.orgId}, 'MV New', 'ferry', 'NG')`,
          ),
        ).toMatch(/row-level security/);
        expect(await tx`update public.routes set duration_min = 50 where id = ${s.routeId} returning id`).toHaveLength(
          0,
        );
        // Still working: a new trip, the manifest, the safety lock and departure.
        await tx`insert into public.trips (org_id, vessel_id, route_id, currency) values (${s.orgId}, ${s.vesselId}, ${s.routeId}, 'NGN')`;
        await tx`insert into public.manifest_entries (org_id, trip_id, full_name, seats) values (${s.orgId}, ${s.tripId}, 'Ada', 1)`;
      });
      await recordCheck(tx, s.orgId, s.tripId);
      await as(tx, s.owner.id, async () => {
        const [dep] = await tx`update public.trips set status = 'departed' where id = ${s.tripId} returning status`;
        expect(dep?.status).toBe("departed");
      });
    }));
});

describe("reconcile-payments job", () => {
  it("lapses subscriptions after the period, read-only after 7 days' grace, and releases expired holds", async () => {
    const user = randomUUID();
    await sql`insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
              values (${user}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())`;
    cleanup.users.push(user);
    const orgs: string[] = [];
    for (const name of ["Lapsed recently", "Lapsed long ago", "Paid up"]) {
      const [o] =
        await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
                            values (${name}, 'ferry_operator', 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{ferry}') returning id`;
      orgs.push(o!.id as string);
      cleanup.orgs.push(o!.id as string);
    }
    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
    for (const [org, end] of [
      [orgs[0], daysAgo(2)],
      [orgs[1], daysAgo(10)],
      [orgs[2], daysAgo(-20)],
    ] as const) {
      await sql`insert into public.subscriptions (org_id, plan_code, currency, amount_minor, status, period_start, period_end)
                values (${org!}, 'ferry_basic', 'NGN', 3000000, 'active', ${daysAgo(30)}, ${end})`;
    }
    const [v] =
      await sql`insert into public.vessels (org_id, name, type, operating_country_code, passenger_capacity, ferry_enabled)
                          values (${orgs[2]!}, 'MV Hold', 'ferry', 'NG', 5, true) returning id`;
    const [t] = await sql`insert into public.trips (org_id, vessel_id, origin_text, destination_text, currency)
                          values (${orgs[2]!}, ${v!.id}, 'A', 'B', 'NGN') returning id`;
    const code = `H${randomUUID().replace(/-/g, "").slice(0, 7).toUpperCase()}`;
    await sql`insert into public.tickets (org_id, trip_id, buyer_name, qty, unit_price_minor, platform_fee_minor, total_minor, currency, fee_bearer, channel, code, status, reserved_until)
              values (${orgs[2]!}, ${t!.id}, 'Ada', 2, 100, 0, 200, 'NGN', 'passenger', 'online', ${code}, 'reserved', now() - interval '5 minutes')`;

    const summary = await reconcilePayments(now);
    expect(summary.holdsReleased).toBeGreaterThanOrEqual(1);
    const rows = await sql`select org_id, status from public.subscriptions where org_id in ${sql(orgs)}`;
    const status = new Map(rows.map((r) => [r.org_id as string, r.status as string]));
    expect(status.get(orgs[0]!)).toBe("past_due");
    expect(status.get(orgs[1]!)).toBe("read_only");
    expect(status.get(orgs[2]!)).toBe("active");
    const [ticket] = await sql`select status from public.tickets where code = ${code}`;
    expect(ticket?.status).toBe("cancelled");
  });
});
