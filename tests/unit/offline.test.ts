import { describe, expect, it } from "vitest";
import { applyStep, canRemove, checkAdd, checkStep, isAmendment, type LocalTrip } from "@/lib/offline/model";
import { syncBatchSchema, syncOpSchema } from "@/lib/schemas/sync";
import { ServiceError } from "@/server/services/errors";
import { clampClientTime, classifyError } from "@/server/services/sync";

const trip = (over: Partial<LocalTrip> = {}): LocalTrip => ({
  key: "0190f1f2-0000-7000-8000-000000000001",
  vesselId: "0190f1f2-0000-7000-8000-000000000002",
  label: "A → B",
  scheduledDeparture: null,
  status: "scheduled",
  lifejackets: false,
  currency: "NGN",
  synced: true,
  ...over,
});

describe("local trip rules (mirror the M4 database triggers)", () => {
  it.each([
    ["scheduled", "boarding", null],
    ["boarding", "boarding", "invalid_transition"],
    ["departed", "boarding", "invalid_transition"],
    ["departed", "arrive", null],
    ["boarding", "arrive", "invalid_transition"],
    ["scheduled", "cancel", null],
    ["departed", "cancel", "invalid_transition"],
    ["arrived", "arrive", "trip_closed"],
    ["cancelled", "boarding", "trip_closed"],
    ["departed", "lifejackets", "invalid_transition"],
  ] as const)("%s → %s: %s", (status, step, expected) => {
    expect(checkStep(trip({ status, lifejackets: true }), 3, step)).toBe(expected);
  });

  it("departure needs life jackets and someone on board", () => {
    expect(checkStep(trip({ status: "boarding" }), 3, "depart")).toBe("lifejackets_unconfirmed");
    expect(checkStep(trip({ status: "boarding", lifejackets: true }), 0, "depart")).toBe("validation");
    expect(checkStep(trip({ status: "boarding", lifejackets: true }), 1, "depart")).toBe("safety_check_required");
  });

  it("departure needs a safety check from the last hour that passed, was accepted or was overridden", () => {
    const now = new Date("2026-11-04T11:00:00Z");
    const latest = (over: Partial<NonNullable<NonNullable<LocalTrip["safety"]>["latest"]>>) =>
      trip({
        status: "boarding",
        lifejackets: true,
        safety: {
          origin: null,
          destination: null,
          durationMin: 45,
          timeZone: "Africa/Lagos",
          expiredDocuments: [],
          weather: null,
          latest: {
            key: "0190f1f2-0000-7000-8000-0000000000c1",
            result: "pass",
            reasons: [],
            checkedAt: "2026-11-04T10:30:00Z",
            storedAt: null,
            offline: true,
            acknowledged: false,
            requested: false,
            decision: null,
            ...over,
          },
        },
      });
    expect(checkStep(latest({}), 1, "depart", now)).toBeNull();
    expect(checkStep(latest({ checkedAt: "2026-11-04T09:59:00Z" }), 1, "depart", now)).toBe("safety_check_required");
    expect(checkStep(latest({ result: "warn" }), 1, "depart", now)).toBe("safety_unacknowledged");
    expect(checkStep(latest({ result: "warn", acknowledged: true }), 1, "depart", now)).toBeNull();
    expect(checkStep(latest({ result: "block", requested: true }), 1, "depart", now)).toBe("safety_blocked");
    expect(
      checkStep(latest({ result: "block", decision: { decision: "declined", reason: "No" } }), 1, "depart", now),
    ).toBe("safety_blocked");
    expect(
      checkStep(latest({ result: "block", decision: { decision: "approved", reason: "Ok" } }), 1, "depart", now),
    ).toBeNull();
  });

  it("steps change the trip and mark it unsynced", () => {
    expect(applyStep(trip(), "depart")).toMatchObject({ status: "departed", synced: false });
    expect(applyStep(trip(), "lifejackets")).toMatchObject({ lifejackets: true, synced: false });
    expect(applyStep(trip({ lifejackets: true }), "lifejackets", false).lifejackets).toBe(false);
  });

  it("capacity is a hard limit before and after departure", () => {
    expect(checkAdd(trip(), 4, 5, 1)).toBeNull();
    expect(checkAdd(trip(), 4, 5, 2)).toBe("capacity_exceeded");
    expect(checkAdd(trip({ status: "departed" }), 5, 5, 1)).toBe("capacity_exceeded");
    expect(checkAdd(trip(), 100, null, 1)).toBeNull();
    expect(checkAdd(trip({ status: "arrived" }), 0, 5, 1)).toBe("trip_closed");
    expect(checkAdd(trip(), 0, 5, 0)).toBe("validation");
  });

  it("after departure additions are amendments and nobody can be removed", () => {
    expect(isAmendment(trip({ status: "boarding" }))).toBe(false);
    expect(isAmendment(trip({ status: "departed" }))).toBe(true);
    expect(canRemove(trip({ status: "boarding" }))).toBe(true);
    expect(canRemove(trip({ status: "departed" }))).toBe(false);
  });
});

describe("sync op validation", () => {
  const id = "0190f1f2-0000-7000-8000-00000000000a";
  const at = "2026-11-04T10:00:00.000Z";

  it("accepts each op kind", () => {
    for (const op of [
      { op: "trip.create", client_id: id, at, payload: { vessel_id: id, route_id: id } },
      {
        op: "trip.create",
        client_id: id,
        at,
        payload: { vessel_id: id, origin_text: "Ikorodu", destination_text: "CMS" },
      },
      { op: "trip.step", client_id: id, at, payload: { trip: id, step: "lifejackets", confirmed: true } },
      { op: "trip.step", client_id: id, at, payload: { trip: id, step: "arrive", cash: "27000" } },
      { op: "manifest.add", client_id: id, at, payload: { trip: id, seats: 2, full_name: "Ade" } },
      { op: "manifest.remove", client_id: id, at, payload: { trip: id, entry: id } },
    ]) {
      expect(syncOpSchema.safeParse(op).success, JSON.stringify(op)).toBe(true);
    }
  });

  it("rejects a trip with neither a route nor both ends, bad ids and bad amounts", () => {
    expect(syncOpSchema.safeParse({ op: "trip.create", client_id: id, at, payload: { vessel_id: id } }).success).toBe(
      false,
    );
    expect(
      syncOpSchema.safeParse({ op: "manifest.add", client_id: "x", at, payload: { trip: id, seats: 1 } }).success,
    ).toBe(false);
    expect(
      syncOpSchema.safeParse({ op: "trip.step", client_id: id, at, payload: { trip: id, step: "arrive", cash: "1,0" } })
        .success,
    ).toBe(false);
    expect(syncBatchSchema.safeParse({ org_id: id, ops: [] }).success).toBe(false);
  });
});

describe("sync server helpers", () => {
  const now = new Date("2026-11-04T12:00:00Z");

  it("keeps the phone's time when plausible, else uses the server's", () => {
    expect(clampClientTime("2026-11-04T09:30:00Z", now)).toBe("2026-11-04T09:30:00.000Z");
    expect(clampClientTime("2026-11-04T12:01:00Z", now)).toBe("2026-11-04T12:00:00.000Z");
    expect(clampClientTime("2026-11-05T12:00:00Z", now)).toBe(now.toISOString());
    expect(clampClientTime("2026-10-01T12:00:00Z", now)).toBe(now.toISOString());
  });

  it("server state wins on status conflicts; other refusals are rejections", () => {
    expect(classifyError(new ServiceError("invalid_transition"))).toEqual({
      status: "conflict",
      code: "invalid_transition",
    });
    expect(classifyError(new ServiceError("trip_closed")).status).toBe("conflict");
    expect(classifyError(new ServiceError("capacity_exceeded"))).toEqual({
      status: "rejected",
      code: "capacity_exceeded",
    });
    expect(() => classifyError(new Error("boom"))).toThrow("boom");
  });
});
