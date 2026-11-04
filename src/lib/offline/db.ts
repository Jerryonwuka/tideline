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

export type CaptainDb = Dexie & {
  meta: EntityTable<CachedMeta, "key">;
  vessels: EntityTable<CaptainSnapshot["vessels"][number], "id">;
  routes: EntityTable<CaptainSnapshot["routes"][number], "id">;
  trips: EntityTable<LocalTrip, "key">;
  manifest: EntityTable<LocalEntry, "key">;
  outbox: EntityTable<OutboxItem, "clientId">;
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
  instance = db;
  return db;
}
