import Dexie, { type EntityTable } from "dexie";
import type { CaptainSnapshot, SyncOp } from "@/lib/schemas/sync";
import type { LocalEntry, LocalTrip } from "./model";

// The phone's offline store (§8): cached reference data and today's work, plus the outbox of ops
// waiting to sync. Cleared on sign-out.

export type CachedMeta = Omit<CaptainSnapshot, "vessels" | "routes" | "trips" | "manifest"> & { key: "snapshot" };

export interface OutboxItem {
  clientId: string;
  orgId: string;
  op: SyncOp;
  /** pending: waiting to send. failed: the server refused it; shown on the Pending sync screen. */
  state: "pending" | "failed";
  code?: string;
  createdAt: string;
}

/** A GPS point waiting to upload (append-only; uploaded in time order). */
export interface QueuedPosition {
  clientId: string;
  orgId: string;
  tripKey: string;
  recordedAt: string;
  lat: number;
  lng: number;
  speedKn: number | null;
  accuracyM: number | null;
}

export type CaptainDb = Dexie & {
  meta: EntityTable<CachedMeta, "key">;
  vessels: EntityTable<CaptainSnapshot["vessels"][number], "id">;
  routes: EntityTable<CaptainSnapshot["routes"][number], "id">;
  trips: EntityTable<LocalTrip, "key">;
  manifest: EntityTable<LocalEntry, "key">;
  outbox: EntityTable<OutboxItem, "clientId">;
  positions: EntityTable<QueuedPosition, "clientId">;
};

let instance: CaptainDb | null = null;

export function captainDb(): CaptainDb {
  if (instance) return instance;
  const db = new Dexie("tideline-captain") as CaptainDb;
  db.version(1).stores({
    meta: "key",
    vessels: "id",
    routes: "id",
    trips: "key, vesselId",
    manifest: "key, tripKey",
    outbox: "clientId, state, createdAt",
  });
  db.version(2).stores({ positions: "clientId, recordedAt, tripKey" });
  instance = db;
  return db;
}
