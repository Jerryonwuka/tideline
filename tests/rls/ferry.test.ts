import { afterAll, describe, expect, it } from "vitest";
import { addMember, as, createOrg, createUser, inTx, rejects, sql, type Tx } from "./helpers";

afterAll(async () => {
  await sql.end();
});

async function fleet(tx: Tx, orgId: string, capacity = 3) {
  const [v] =
    await tx`insert into public.vessels (org_id, name, type, operating_country_code, passenger_capacity, ferry_enabled)
                       values (${orgId}, 'MV Ferry', 'ferry', 'NG', ${capacity}, true) returning id`;
  const [j1, j2] = await tx`select id from public.jetties order by name limit 2`;
  const [r] =
    await tx`insert into public.routes (org_id, origin_jetty_id, destination_jetty_id, duration_min, base_fare_minor, currency)
                       values (${orgId}, ${j1!.id}, ${j2!.id}, 45, 150000, 'NGN') returning id`;
  return { vesselId: v!.id as string, routeId: r!.id as string };
}
async function trip(
  tx: Tx,
  orgId: string,
  vesselId: string,
  routeId: string,
  captainCrewId: string | null = null,
  cash = 0,
) {
  const [t] =
    await tx`insert into public.trips (org_id, vessel_id, route_id, currency, captain_crew_id, takings_cash_minor, scheduled_departure)
                       values (${orgId}, ${vesselId}, ${routeId}, 'NGN', ${captainCrewId}, ${cash}, now()) returning id`;
  return t!.id as string;
}
async function captainOn(tx: Tx, orgId: string, vesselId: string, name: string) {
  const user = await createUser(tx, name);
  await addMember(tx, orgId, user.id, "captain");
  const [c] =
    await tx`insert into public.crew_members (org_id, full_name, crew_role, user_id) values (${orgId}, ${name}, 'captain', ${user.id}) returning id`;
  await tx`insert into public.vessel_crew (org_id, vessel_id, crew_member_id) values (${orgId}, ${vesselId}, ${c!.id})`;
  return { userId: user.id, crewId: c!.id as string };
}

describe("ferry trips and manifests", () => {
  it("a captain sees only the trips (and takings) of their own vessel, never org totals", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const a = await fleet(tx, orgId);
      const [vB] =
        await tx`insert into public.vessels (org_id, name, type, operating_country_code, ferry_enabled) values (${orgId}, 'Other', 'ferry', 'NG', true) returning id`;
      const cap = await captainOn(tx, orgId, a.vesselId, "Captain A");
      const mine = await trip(tx, orgId, a.vesselId, a.routeId, cap.crewId, 450000);
      await trip(tx, orgId, vB!.id, a.routeId, null, 900000);

      await as(tx, cap.userId, async () => {
        const visible = await tx`select id, takings_cash_minor from public.trips`;
        expect(visible.map((r) => r.id)).toEqual([mine]);
        const [sum] =
          await tx`select coalesce(sum(takings_cash_minor), 0)::int as total from public.trips where org_id = ${orgId}`;
        expect(sum?.total).toBe(450000);
      });
      await as(tx, owner.id, async () => {
        const [sum] = await tx`select sum(takings_cash_minor)::int as total from public.trips where org_id = ${orgId}`;
        expect(sum?.total).toBe(1350000);
      });
    }));

  it("the manifest cannot exceed capacity, with no override", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const f = await fleet(tx, orgId, 3);
      const t = await trip(tx, orgId, f.vesselId, f.routeId);
      await as(tx, owner.id, async () => {
        await tx`insert into public.manifest_entries (org_id, trip_id, full_name, seats) values (${orgId}, ${t}, 'Ada', 2)`;
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`insert into public.manifest_entries (org_id, trip_id, full_name, seats) values (${orgId}, ${t}, 'Bola', 2)`,
          ),
        ).toMatch(/capacity_exceeded/);
        await tx`insert into public.manifest_entries (org_id, trip_id, full_name, seats) values (${orgId}, ${t}, 'Chi', 1)`;
        // Not even the owner, and not even as a late amendment after departure.
        await tx`update public.trips set lifejackets_confirmed = true, status = 'departed' where id = ${t}`;
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`insert into public.manifest_entries (org_id, trip_id, full_name, seats) values (${orgId}, ${t}, 'Dayo', 1)`,
          ),
        ).toMatch(/capacity_exceeded/);
      });
    }));

  it("the manifest locks at departure; later additions are audited amendments", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const f = await fleet(tx, orgId, 10);
      const t = await trip(tx, orgId, f.vesselId, f.routeId);
      await as(tx, owner.id, async () => {
        const [first] =
          await tx`insert into public.manifest_entries (org_id, trip_id, full_name, seats) values (${orgId}, ${t}, 'Ada', 2) returning id`;
        expect(await rejects(tx, (sp) => sp`update public.trips set status = 'departed' where id = ${t}`)).toMatch(
          /lifejackets_unconfirmed/,
        );
        const [dep] =
          await tx`update public.trips set lifejackets_confirmed = true, status = 'departed' where id = ${t} returning passenger_count, actual_departure`;
        expect(dep?.passenger_count).toBe(2);
        expect(dep?.actual_departure).not.toBeNull();

        expect(
          await rejects(tx, (sp) => sp`update public.manifest_entries set seats = 3 where id = ${first!.id}`),
        ).toMatch(/manifest_locked/);
        expect(await rejects(tx, (sp) => sp`delete from public.manifest_entries where id = ${first!.id}`)).toMatch(
          /manifest_locked/,
        );
        // Boarding scans still work after departure.
        expect(
          await tx`update public.manifest_entries set boarded_at = now() where id = ${first!.id} returning id`,
        ).toHaveLength(1);

        const [late] =
          await tx`insert into public.manifest_entries (org_id, trip_id, full_name, seats) values (${orgId}, ${t}, 'Late', 1) returning id, is_amendment`;
        expect(late?.is_amendment).toBe(true);
        const [audit] = await tx`select action from public.audit_logs where entity_id = ${late!.id}`;
        expect(audit?.action).toBe("manifest_entry.created");
      });
    }));

  it("trip status only moves forward and closed trips can't be edited", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const f = await fleet(tx, orgId);
      const t = await trip(tx, orgId, f.vesselId, f.routeId);
      await as(tx, owner.id, async () => {
        expect(await rejects(tx, (sp) => sp`update public.trips set status = 'arrived' where id = ${t}`)).toMatch(
          /invalid_transition/,
        );
        await tx`update public.trips set lifejackets_confirmed = true, status = 'departed' where id = ${t}`;
        await tx`update public.trips set status = 'arrived', takings_cash_minor = 2700000 where id = ${t}`;
        expect(await rejects(tx, (sp) => sp`update public.trips set status = 'departed' where id = ${t}`)).toMatch(
          /invalid_transition/,
        );
        expect(await rejects(tx, (sp) => sp`update public.trips set takings_cash_minor = 1 where id = ${t}`)).toMatch(
          /trip_closed/,
        );
      });
    }));

  it("crew can add passengers but only captains (and the office) move the trip", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const f = await fleet(tx, orgId, 10);
      const t = await trip(tx, orgId, f.vesselId, f.routeId);
      const deck = await createUser(tx, "Deckhand");
      await addMember(tx, orgId, deck.id, "crew");
      const [c] =
        await tx`insert into public.crew_members (org_id, full_name, crew_role, user_id) values (${orgId}, 'Deck', 'deckhand', ${deck.id}) returning id`;
      await tx`insert into public.vessel_crew (org_id, vessel_id, crew_member_id) values (${orgId}, ${f.vesselId}, ${c!.id})`;
      await as(tx, deck.id, async () => {
        expect(
          await tx`insert into public.manifest_entries (org_id, trip_id, full_name) values (${orgId}, ${t}, 'Walk-up') returning id`,
        ).toHaveLength(1);
        expect(await tx`update public.trips set status = 'boarding' where id = ${t} returning id`).toHaveLength(0);
      });
    }));

  it("schedules create today's trips once, with the assigned captain", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const f = await fleet(tx, orgId);
      const cap = await captainOn(tx, orgId, f.vesselId, "Captain");
      await tx`insert into public.schedules (org_id, route_id, vessel_id, days_of_week, departure_time)
               values (${orgId}, ${f.routeId}, ${f.vesselId}, '{0,1,2,3,4,5,6}', '07:15')`;
      await as(tx, cap.userId, async () => {
        const [first] = await tx`select public.materialise_schedule_trips(${orgId}, '2026-11-04') as n`;
        const [again] = await tx`select public.materialise_schedule_trips(${orgId}, '2026-11-04') as n`;
        expect([first?.n, again?.n]).toEqual([1, 0]);
        const [t] = await tx`select captain_crew_id, scheduled_departure from public.trips where org_id = ${orgId}`;
        expect(t?.captain_crew_id).toBe(cap.crewId);
        // 07:15 at the Lagos jetty = 06:15 UTC.
        expect((t?.scheduled_departure as Date).toISOString()).toBe("2026-11-04T06:15:00.000Z");
      });
    }));

  it("jetty proposals start as proposed and only admins activate them", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      await as(tx, owner.id, async () => {
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`insert into public.jetties (country_code, time_zone, name, lat, lng, status, proposed_by_org_id) values ('NG', 'Africa/Lagos', 'X', 6.4, 3.4, 'active', ${orgId})`,
          ),
        ).toMatch(/row-level security/);
        const [j] =
          await tx`insert into public.jetties (country_code, time_zone, name, lat, lng, status, proposed_by_org_id) values ('NG', 'Africa/Lagos', 'New Jetty', 6.4, 3.4, 'proposed', ${orgId}) returning id`;
        expect(await tx`update public.jetties set status = 'active' where id = ${j!.id} returning id`).toHaveLength(0);
      });
    }));
});
