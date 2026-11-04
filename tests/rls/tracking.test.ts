import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { addMember, as, createOrg, createUser, inTx, recordCheck, rejects, sql, type Tx } from "./helpers";

afterAll(async () => {
  await sql.end();
});

async function setup(tx: Tx) {
  const owner = await createUser(tx, "Owner");
  const orgId = await createOrg(tx, owner.id);
  const vessels = [] as string[];
  for (const name of ["MV One", "MV Two"]) {
    const [v] =
      await tx`insert into public.vessels (org_id, name, type, operating_country_code, passenger_capacity, ferry_enabled)
                         values (${orgId}, ${name}, 'ferry', 'NG', 10, true) returning id`;
    vessels.push(v!.id as string);
  }
  const captains = [] as { userId: string; crewId: string }[];
  for (const [i, vesselId] of vessels.entries()) {
    const user = await createUser(tx, `Captain ${i}`);
    await addMember(tx, orgId, user.id, "captain");
    const [c] = await tx`insert into public.crew_members (org_id, full_name, crew_role, user_id)
                         values (${orgId}, ${`Captain ${i}`}, 'captain', ${user.id}) returning id`;
    await tx`insert into public.vessel_crew (org_id, vessel_id, crew_member_id) values (${orgId}, ${vesselId}, ${c!.id})`;
    captains.push({ userId: user.id, crewId: c!.id as string });
  }
  const [t] =
    await tx`insert into public.trips (org_id, vessel_id, origin_text, destination_text, currency, captain_crew_id, lifejackets_confirmed)
                       values (${orgId}, ${vessels[0]!}, 'A', 'B', 'NGN', ${captains[0]!.crewId}, true) returning id`;
  return { owner, orgId, tripId: t!.id as string, captains };
}

const point = (sp: Tx, orgId: string, tripId: string, at = "now()") =>
  sp.unsafe(
    `insert into public.trip_positions (org_id, trip_id, recorded_at, lat, lng, client_id)
     values ($1, $2, ${at}, 6.45, 3.42, $3) returning id`,
    [orgId, tripId, randomUUID()],
  );

describe("trip tracking", () => {
  it("only the trip's captain records points, only during the voyage, and points can't be changed", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const [mine, other] = s.captains;
      // Not before departure.
      await as(tx, mine!.userId, async () => {
        expect(await rejects(tx, (sp) => point(sp, s.orgId, s.tripId))).toMatch(/invalid_transition/);
      });
      await recordCheck(tx, s.orgId, s.tripId);
      await tx`update public.trips set status = 'departed' where id = ${s.tripId}`;
      await as(tx, mine!.userId, async () => {
        await point(tx, s.orgId, s.tripId);
        // Offline points arrive later but belong to the voyage.
        await tx`update public.trips set status = 'arrived' where id = ${s.tripId}`;
        await point(tx, s.orgId, s.tripId, "now()");
        expect(await rejects(tx, (sp) => point(sp, s.orgId, s.tripId, "now() + interval '1 hour'"))).toMatch(
          /invalid_transition/,
        );
        expect(
          await rejects(tx, (sp) => sp`update public.trip_positions set lat = 0 where trip_id = ${s.tripId}`),
        ).toMatch(/permission denied/);
        expect(await rejects(tx, (sp) => sp`delete from public.trip_positions where trip_id = ${s.tripId}`)).toMatch(
          /permission denied/,
        );
      });
      // Another vessel's captain can't add to or see this trip's track.
      await as(tx, other!.userId, async () => {
        expect(await rejects(tx, (sp) => point(sp, s.orgId, s.tripId))).toMatch(/row-level security/);
        expect(await tx`select 1 from public.trip_positions where trip_id = ${s.tripId}`).toHaveLength(0);
      });
      await as(tx, s.owner.id, async () => {
        expect(await tx`select 1 from public.trip_positions where trip_id = ${s.tripId}`).toHaveLength(2);
      });
    }));

  it("the default ticket fee is 1% (BUILD_SPEC §4.2)", () =>
    inTx(async (tx) => {
      const [row] = await tx`select public.fee_bps('ticket_fee_bps', 'NG') as bps`;
      expect(row?.bps).toBe(100);
    }));
});
