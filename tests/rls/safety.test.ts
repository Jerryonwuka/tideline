import { afterAll, describe, expect, it } from "vitest";
import { addMember, as, createOrg, createUser, inTx, recordCheck, rejects, sql, type Tx } from "./helpers";

afterAll(async () => {
  await sql.end();
});

const WIND = [{ code: "wind", severity: "block", value: 45, limit: 30, overridable: true }];
const CAPACITY = [{ code: "capacity", severity: "block", value: 12, limit: 10, overridable: false }];

async function setup(tx: Tx) {
  const owner = await createUser(tx, "Owner");
  const orgId = await createOrg(tx, owner.id);
  const [v] =
    await tx`insert into public.vessels (org_id, name, type, operating_country_code, passenger_capacity, ferry_enabled)
                       values (${orgId}, 'MV Safe', 'ferry', 'NG', 10, true) returning id`;
  const captain = await createUser(tx, "Captain");
  await addMember(tx, orgId, captain.id, "captain");
  const [c] =
    await tx`insert into public.crew_members (org_id, full_name, crew_role, user_id) values (${orgId}, 'Captain', 'captain', ${captain.id}) returning id`;
  await tx`insert into public.vessel_crew (org_id, vessel_id, crew_member_id) values (${orgId}, ${v!.id}, ${c!.id})`;
  const [t] =
    await tx`insert into public.trips (org_id, vessel_id, origin_text, destination_text, currency, captain_crew_id, lifejackets_confirmed)
                       values (${orgId}, ${v!.id}, 'A', 'B', 'NGN', ${c!.id}, true) returning id`;
  await tx`insert into public.manifest_entries (org_id, trip_id, full_name, seats) values (${orgId}, ${t!.id}, 'Ada', 2)`;
  return { owner, captain, orgId, tripId: t!.id as string };
}

const depart = (tx: Tx, tripId: string) => (sp: Tx) =>
  sp`update public.trips set status = 'departed' where id = ${tripId}`;

describe("safety lock", () => {
  it("departure needs a recent check that passed, was accepted, or was overridden", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      await as(tx, s.captain.id, async () => {
        expect(await rejects(tx, depart(tx, s.tripId))).toMatch(/safety_check_required/);
      });

      // A check stored more than an hour ago doesn't count.
      const old = await recordCheck(tx, s.orgId, s.tripId);
      await tx`alter table public.safety_checks disable trigger user`;
      await tx`update public.safety_checks set created_at = now() - interval '61 minutes' where id = ${old}`;
      await tx`alter table public.safety_checks enable trigger user`;
      await as(tx, s.captain.id, async () => {
        expect(await rejects(tx, depart(tx, s.tripId))).toMatch(/safety_check_required/);
      });

      // Warn: needs the captain's acknowledgement.
      const warn = await recordCheck(tx, s.orgId, s.tripId, "warn", [
        { code: "weather_unknown", severity: "warn", overridable: true },
      ]);
      await as(tx, s.captain.id, async () => {
        expect(await rejects(tx, depart(tx, s.tripId))).toMatch(/safety_unacknowledged/);
        await tx`insert into public.safety_acknowledgements (safety_check_id, org_id, acknowledged_by)
                 values (${warn}, ${s.orgId}, ${s.captain.id})`;
      });

      // A newer block wins over the accepted warning.
      const block = await recordCheck(tx, s.orgId, s.tripId, "block", WIND);
      await as(tx, s.captain.id, async () => {
        expect(await rejects(tx, depart(tx, s.tripId))).toMatch(/safety_blocked/);
        await tx`insert into public.safety_override_requests (org_id, trip_id, safety_check_id, requested_by, note)
                 values (${s.orgId}, ${s.tripId}, ${block}, ${s.captain.id}, 'Calm in the lagoon')`;
      });
      const [req] = await tx`select id from public.safety_override_requests where safety_check_id = ${block}`;

      // The captain can't decide; the owner can.
      await as(tx, s.captain.id, async () => {
        expect(
          await rejects(
            tx,
            (
              sp,
            ) => sp`insert into public.safety_overrides (org_id, trip_id, safety_check_id, request_id, requested_by, requested_at, decided_by, decision, reason)
                        values (${s.orgId}, ${s.tripId}, ${block}, ${req!.id}, ${s.captain.id}, now(), ${s.captain.id}, 'approved', 'self-approved')`,
          ),
        ).toMatch(/row-level security/);
      });
      await as(tx, s.owner.id, async () => {
        await tx`insert into public.safety_overrides (org_id, trip_id, safety_check_id, request_id, requested_by, requested_at, decided_by, decision, reason)
                 values (${s.orgId}, ${s.tripId}, ${block}, ${req!.id}, ${s.owner.id}, now() - interval '1 day', ${s.owner.id}, 'approved', 'Checked with the jetty master')`;
        const [o] =
          await tx`select requested_by, requested_at, decided_by, reason, decided_at from public.safety_overrides where request_id = ${req!.id}`;
        // Requester and time come from the request, whatever the client sent.
        expect(o?.requested_by).toBe(s.captain.id);
        expect(o?.decided_by).toBe(s.owner.id);
        expect(o?.reason).toBe("Checked with the jetty master");
        expect(o?.decided_at).not.toBeNull();
      });
      await as(tx, s.captain.id, async () => {
        const [dep] = await tx`update public.trips set status = 'departed' where id = ${s.tripId} returning status`;
        expect(dep?.status).toBe("departed");
      });
    }));

  it("capacity (and life-jacket) blocks can never be overridden", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const block = await recordCheck(tx, s.orgId, s.tripId, "block", [...WIND, ...CAPACITY]);
      await as(tx, s.captain.id, async () => {
        expect(
          await rejects(
            tx,
            (sp) => sp`insert into public.safety_override_requests (org_id, trip_id, safety_check_id, requested_by)
                        values (${s.orgId}, ${s.tripId}, ${block}, ${s.captain.id})`,
          ),
        ).toMatch(/not_overridable/);
      });
    }));

  it("checks, acknowledgements, requests and overrides can't be changed or deleted, even by the owner", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const block = await recordCheck(tx, s.orgId, s.tripId, "block", WIND);
      await as(tx, s.captain.id, async () => {
        await tx`insert into public.safety_override_requests (org_id, trip_id, safety_check_id, requested_by)
                 values (${s.orgId}, ${s.tripId}, ${block}, ${s.captain.id})`;
      });
      const [req] = await tx`select id from public.safety_override_requests where safety_check_id = ${block}`;
      await as(tx, s.owner.id, async () => {
        await tx`insert into public.safety_overrides (org_id, trip_id, safety_check_id, request_id, requested_by, requested_at, decided_by, decision, reason)
                 values (${s.orgId}, ${s.tripId}, ${block}, ${req!.id}, ${s.owner.id}, now(), ${s.owner.id}, 'declined', 'Too windy')`;
        for (const [table, stmt] of [
          ["checks", (sp: Tx) => sp`update public.safety_checks set result = 'pass' where id = ${block}`],
          ["checks", (sp: Tx) => sp`delete from public.safety_checks where id = ${block}`],
          ["requests", (sp: Tx) => sp`update public.safety_override_requests set note = 'x' where id = ${req!.id}`],
          ["requests", (sp: Tx) => sp`delete from public.safety_override_requests where id = ${req!.id}`],
          [
            "overrides",
            (sp: Tx) => sp`update public.safety_overrides set decision = 'approved' where request_id = ${req!.id}`,
          ],
          ["overrides", (sp: Tx) => sp`delete from public.safety_overrides where request_id = ${req!.id}`],
        ] as const) {
          expect(await rejects(tx, stmt), table).toMatch(/permission denied/);
        }
        // People can't write checks at all; the server computes them.
        expect(
          await rejects(
            tx,
            (sp) => sp`insert into public.safety_checks (org_id, trip_id, checked_at, checked_by, rules_applied, result)
                        values (${s.orgId}, ${s.tripId}, now(), ${s.owner.id}, '{}', 'pass')`,
          ),
        ).toMatch(/permission denied/);
        // A decided request stays decided.
        expect(
          await rejects(
            tx,
            (
              sp,
            ) => sp`insert into public.safety_overrides (org_id, trip_id, safety_check_id, request_id, requested_by, requested_at, decided_by, decision, reason)
                        values (${s.orgId}, ${s.tripId}, ${block}, ${req!.id}, ${s.owner.id}, now(), ${s.owner.id}, 'approved', 'Changed my mind')`,
          ),
        ).toMatch(/duplicate key/);
      });
      const [declined] = await tx`select decision from public.safety_overrides where request_id = ${req!.id}`;
      expect(declined?.decision).toBe("declined");
      await as(tx, s.captain.id, async () => {
        expect(await rejects(tx, depart(tx, s.tripId))).toMatch(/safety_blocked/);
      });
    }));

  it("managers decide only when the org allows it", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const manager = await createUser(tx, "Manager");
      await addMember(tx, s.orgId, manager.id, "manager");
      const block = await recordCheck(tx, s.orgId, s.tripId, "block", WIND);
      const [req] =
        await tx`insert into public.safety_override_requests (org_id, trip_id, safety_check_id, requested_by)
                             values (${s.orgId}, ${s.tripId}, ${block}, ${s.captain.id}) returning id`;
      const decide = (
        sp: Tx,
      ) => sp`insert into public.safety_overrides (org_id, trip_id, safety_check_id, request_id, requested_by, requested_at, decided_by, decision, reason)
                                    values (${s.orgId}, ${s.tripId}, ${block}, ${req!.id}, ${manager.id}, now(), ${manager.id}, 'approved', 'Fine by me')`;
      await as(tx, manager.id, async () => {
        expect(await rejects(tx, decide)).toMatch(/row-level security/);
      });
      await tx`update public.orgs set settings = coalesce(settings, '{}'::jsonb) || '{"manager_can_override": true}' where id = ${s.orgId}`;
      await as(tx, manager.id, async () => {
        await decide(tx);
      });
    }));

  it("an org can tighten its limits but never loosen them past the defaults", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const [d] = await tx`select * from public.safety_defaults_for('NG')`;
      expect(Number(d?.max_wind_kmh)).toBeGreaterThan(0);
      await as(tx, s.owner.id, async () => {
        await tx`insert into public.safety_thresholds (org_id, max_wind_kmh, max_gust_kmh, max_wave_m, max_precip_mm_h, night_block, permitted_start, permitted_end)
                 values (${s.orgId}, ${Number(d!.max_wind_kmh) - 5}, ${d!.max_gust_kmh}, ${d!.max_wave_m}, ${d!.max_precip_mm_h}, true, '07:00', '18:00')`;
        for (const loosen of [
          (sp: Tx) =>
            sp`update public.safety_thresholds set max_wind_kmh = ${Number(d!.max_wind_kmh) + 1} where org_id = ${s.orgId}`,
          (sp: Tx) =>
            sp`update public.safety_thresholds set max_wave_m = ${Number(d!.max_wave_m) + 0.5} where org_id = ${s.orgId}`,
          (sp: Tx) => sp`update public.safety_thresholds set night_block = false where org_id = ${s.orgId}`,
        ]) {
          expect(await rejects(tx, loosen)).toMatch(/thresholds_too_loose/);
        }
      });
      // Captains can't change limits (their update matches no rows).
      await as(tx, s.captain.id, async () => {
        const rows =
          await tx`update public.safety_thresholds set max_wind_kmh = 5 where org_id = ${s.orgId} returning 1`;
        expect(rows).toHaveLength(0);
      });
    }));
});
