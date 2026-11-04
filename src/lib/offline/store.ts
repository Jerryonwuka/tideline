import { v7 as uuidv7 } from "uuid";
import type { CaptainSnapshot, SyncOp, SyncResult, TripStep } from "@/lib/schemas/sync";
import { captainDb, type OutboxItem } from "./db";
import {
  applyStep,
  canRemove,
  checkAdd,
  checkStep,
  isAmendment,
  seatsOf,
  type LocalError,
  type LocalTrip,
} from "./model";

// Every captain action is written to the phone first (record + outbox op, one transaction), then
// synced when there is a connection. The screen never waits for the network.

type Result<T = void> = { ok: true; value: T } | { ok: false; error: LocalError };

async function currentOrg(): Promise<string> {
  const meta = await captainDb().meta.get("snapshot");
  if (!meta) throw new Error("No cached session");
  return meta.orgId;
}

async function enqueue(op: SyncOp) {
  const item: OutboxItem = {
    clientId: op.client_id,
    orgId: await currentOrg(),
    op,
    state: "pending",
    createdAt: op.at,
  };
  await captainDb().outbox.add(item);
}

const now = () => new Date().toISOString();

export async function createTrip(input: {
  vesselId: string;
  routeId?: string;
  originText?: string;
  destinationText?: string;
}): Promise<Result<string>> {
  const db = captainDb();
  const key = uuidv7();
  const at = now();
  const route = input.routeId ? await db.routes.get(input.routeId) : undefined;
  const meta = await db.meta.get("snapshot");
  if (!meta || (!route && !(input.originText && input.destinationText))) return { ok: false, error: "validation" };
  await db.transaction("rw", db.trips, db.outbox, db.meta, async () => {
    await db.trips.add({
      key,
      vesselId: input.vesselId,
      label: route?.label ?? `${input.originText} → ${input.destinationText}`,
      scheduledDeparture: at,
      status: "scheduled",
      lifejackets: false,
      currency: meta.currency,
      synced: false,
    });
    await enqueue({
      op: "trip.create",
      client_id: key,
      at,
      payload: {
        vessel_id: input.vesselId,
        ...(route
          ? { route_id: route.id }
          : { origin_text: input.originText, destination_text: input.destinationText }),
      },
    });
  });
  void requestSync();
  return { ok: true, value: key };
}

async function tripAndSeats(tripKey: string) {
  const db = captainDb();
  const trip = await db.trips.get(tripKey);
  if (!trip) throw new Error("Unknown trip");
  const entries = await db.manifest.where("tripKey").equals(tripKey).toArray();
  return { trip, seats: seatsOf(entries) };
}

export async function tripStep(tripKey: string, step: TripStep, extra: { cash?: string } = {}): Promise<Result> {
  const db = captainDb();
  let error: LocalError | null = null;
  await db.transaction("rw", db.trips, db.manifest, db.outbox, db.meta, async () => {
    const { trip, seats } = await tripAndSeats(tripKey);
    error = checkStep(trip, seats, step);
    if (error) return;
    const next: LocalTrip = applyStep(trip, step);
    await db.trips.put(next);
    const at = now();
    const client_id = uuidv7();
    const payload =
      step === "lifejackets"
        ? { trip: tripKey, step, confirmed: next.lifejackets }
        : step === "arrive"
          ? { trip: tripKey, step, ...(extra.cash ? { cash: extra.cash } : {}) }
          : { trip: tripKey, step };
    await enqueue({ op: "trip.step", client_id, at, payload } as SyncOp);
  });
  if (error) return { ok: false, error };
  void requestSync();
  return { ok: true, value: undefined };
}

export async function addPassenger(
  tripKey: string,
  input: { name?: string; seats: number; phone?: string },
): Promise<Result> {
  const db = captainDb();
  let error: LocalError | null = null;
  await db.transaction("rw", db.trips, db.manifest, db.outbox, db.meta, db.vessels, async () => {
    const { trip, seats } = await tripAndSeats(tripKey);
    const vessel = await db.vessels.get(trip.vesselId);
    error = checkAdd(trip, seats, vessel?.capacity ?? null, input.seats);
    if (error) return;
    const key = uuidv7();
    const at = now();
    await db.manifest.add({
      key,
      tripKey,
      name: input.name ?? null,
      seats: input.seats,
      amendment: isAmendment(trip),
      createdAt: at,
      synced: false,
    });
    await enqueue({
      op: "manifest.add",
      client_id: key,
      at,
      payload: {
        trip: tripKey,
        seats: input.seats,
        ...(input.name ? { full_name: input.name } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
      },
    });
  });
  if (error) return { ok: false, error };
  void requestSync();
  return { ok: true, value: undefined };
}

export async function removePassenger(tripKey: string, entryKey: string): Promise<Result> {
  const db = captainDb();
  let error: LocalError | null = null;
  await db.transaction("rw", db.trips, db.manifest, db.outbox, db.meta, async () => {
    const { trip } = await tripAndSeats(tripKey);
    if (!canRemove(trip)) {
      error = "invalid_transition";
      return;
    }
    await db.manifest.delete(entryKey);
    await enqueue({
      op: "manifest.remove",
      client_id: uuidv7(),
      at: now(),
      payload: { trip: tripKey, entry: entryKey },
    });
  });
  if (error) return { ok: false, error };
  void requestSync();
  return { ok: true, value: undefined };
}

export async function dismissFailed(clientId: string) {
  await captainDb().outbox.delete(clientId);
}

// ----- Snapshot (server → phone) ----------------------------------------------------------------

/**
 * Stores a snapshot from the server. Older snapshots (e.g. a page served from the offline cache) are
 * ignored; while ops are waiting to sync, the phone's trips and manifests are kept (they're ahead).
 */
export async function applySnapshot(s: CaptainSnapshot): Promise<void> {
  const db = captainDb();
  await db.transaction("rw", [db.meta, db.vessels, db.routes, db.trips, db.manifest, db.outbox], async () => {
    const meta = await db.meta.get("snapshot");
    const sameUser = meta && meta.orgId === s.orgId && meta.userId === s.userId;
    if (sameUser && meta.generatedAt >= s.generatedAt) return;
    const pending = sameUser
      ? await db.outbox
          .where("state")
          .equals("pending")
          .filter((o) => o.orgId === s.orgId)
          .count()
      : 0;
    const { vessels, routes, trips, manifest, ...rest } = s;
    await db.meta.put({ ...rest, key: "snapshot" });
    await db.vessels.clear();
    await db.vessels.bulkPut(vessels);
    await db.routes.clear();
    await db.routes.bulkPut(routes);
    if (pending > 0) return;
    await db.trips.clear();
    await db.trips.bulkPut(trips.map((t) => ({ ...t, synced: true })));
    await db.manifest.clear();
    await db.manifest.bulkPut(manifest.map((m) => ({ ...m, synced: true })));
  });
}

// ----- Sync (phone → server) --------------------------------------------------------------------

const BATCH = 100;
let running: Promise<void> | null = null;
let again = false;

/**
 * Sends waiting ops, then refreshes from the server. One run at a time; a call during a run
 * schedules one more run straight after, so nothing queued meanwhile waits for the next timer.
 */
export function requestSync(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runSync();
    } while (again && navigator.onLine);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function runSync(): Promise<void> {
  const db = captainDb();
  const meta = await db.meta.get("snapshot");
  if (!meta) return;
  try {
    for (;;) {
      const batch = (await db.outbox.where("state").equals("pending").sortBy("createdAt"))
        .filter((o) => o.orgId === meta.orgId)
        .slice(0, BATCH);
      if (!batch.length) break;
      const res = await fetch("/api/v1/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ org_id: meta.orgId, ops: batch.map((b) => b.op) }),
      });
      if (res.status === 422) {
        // A malformed batch would block the queue forever: park it for the person to see.
        await db.outbox.bulkUpdate(
          batch.map((b) => ({ key: b.clientId, changes: { state: "failed", code: "validation" } })),
        );
        continue;
      }
      if (!res.ok) return; // signed out, server busy: try again later
      const { results } = (await res.json()) as { results: SyncResult[] };
      await db.transaction("rw", db.outbox, async () => {
        for (const r of results) {
          if (r.status === "rejected") await db.outbox.update(r.client_id, { state: "failed", code: r.code });
          else await db.outbox.delete(r.client_id);
        }
      });
      if (results.length < batch.length) return;
    }
    const res = await fetch(`/api/v1/sync?org_id=${meta.orgId}`, { cache: "no-store" });
    if (res.ok) await applySnapshot((await res.json()) as CaptainSnapshot);
  } catch {
    // Offline or the connection dropped mid-way: everything stays queued.
  }
}

/** Wipes the phone's copy (sign-out): cached data, the outbox and cached pages. */
export async function clearOfflineData(): Promise<void> {
  await captainDb().delete();
  if (typeof caches !== "undefined") await caches.delete("captain-pages");
}
