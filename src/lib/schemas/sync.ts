import { z } from "zod";
import type { Reason, Thresholds } from "@/lib/safety/engine";
import { uuid } from "./common";

// §8 Offline sync. Captain screens write ops to the phone's outbox and post them in order to
// POST /api/v1/sync. Each op carries a client_id (UUID v7), unique per org, so replays are no-ops.
// Trips and manifest entries are referenced by server id or by the client_id they were created with.

const majorAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/);

const base = { client_id: uuid, at: z.iso.datetime({ offset: true }) };

const num = z.number().finite().nullable();
/** The forecast the phone had cached when it ran an offline safety check. */
export const weatherInputSchema = z.object({
  fetchedAt: z.iso.datetime({ offset: true }),
  points: z
    .array(
      z.object({
        time: z.iso.datetime({ offset: true }),
        windKmh: num,
        gustKmh: num,
        waveM: num,
        precipMmH: num,
        weatherCode: num,
        visibilityM: num,
      }),
    )
    .max(500),
});

export const syncOpSchema = z.discriminatedUnion("op", [
  z.object({
    ...base,
    op: z.literal("trip.create"),
    payload: z
      .object({
        vessel_id: uuid,
        route_id: uuid.optional(),
        origin_text: z.string().trim().min(2).max(80).optional(),
        destination_text: z.string().trim().min(2).max(80).optional(),
      })
      .refine((v) => v.route_id || (v.origin_text && v.destination_text)),
  }),
  z.object({
    ...base,
    op: z.literal("trip.step"),
    payload: z.discriminatedUnion("step", [
      z.object({ trip: uuid, step: z.literal("boarding") }),
      z.object({ trip: uuid, step: z.literal("lifejackets"), confirmed: z.boolean() }),
      z.object({ trip: uuid, step: z.literal("depart") }),
      z.object({ trip: uuid, step: z.literal("arrive"), cash: majorAmount.optional() }),
      z.object({ trip: uuid, step: z.literal("cancel") }),
    ]),
  }),
  z.object({
    ...base,
    op: z.literal("manifest.add"),
    payload: z.object({
      trip: uuid,
      full_name: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().max(24).optional(),
      seats: z.number().int().min(1).max(50),
    }),
  }),
  z.object({
    ...base,
    op: z.literal("manifest.remove"),
    payload: z.object({ trip: uuid, entry: uuid }),
  }),
  z.object({
    ...base,
    op: z.literal("safety.check"),
    // offline: the server uses the phone's cached weather and time; online: its own fresh weather.
    payload: z.object({ trip: uuid, offline: z.boolean(), weather: weatherInputSchema.nullable() }),
  }),
  z.object({
    ...base,
    op: z.literal("safety.ack"),
    payload: z.object({ check: uuid }),
  }),
]);
export type SyncOp = z.infer<typeof syncOpSchema>;
export type TripStep = Extract<SyncOp, { op: "trip.step" }>["payload"]["step"];

export const syncBatchSchema = z.object({
  org_id: uuid,
  ops: z.array(syncOpSchema).min(1).max(200),
});

/**
 * applied: done now. duplicate: done before (same client_id). conflict: the server's state wins
 * (e.g. the trip already moved on). rejected: not allowed; the phone shows why.
 */
export type SyncResult = {
  client_id: string;
  status: "applied" | "duplicate" | "conflict" | "rejected";
  id?: string | null;
  code?: string;
};

/** A trip's safety inputs and latest check, so the phone can run the rules with no signal. */
export interface TripSafety {
  origin: { lat: number; lng: number; timeZone: string } | null;
  destination: { lat: number; lng: number } | null;
  durationMin: number;
  timeZone: string;
  expiredDocuments: string[];
  weather: z.infer<typeof weatherInputSchema> | null;
  latest: {
    key: string;
    result: "pass" | "warn" | "block";
    reasons: Reason[];
    checkedAt: string;
    /** When the server stored it (null while only on the phone). */
    storedAt: string | null;
    offline: boolean;
    acknowledged: boolean;
    requested: boolean;
    decision: { decision: "approved" | "declined"; reason: string } | null;
  } | null;
}

/** What a captain's phone caches: today's work for their vessels (§8). */
export interface CaptainSnapshot {
  generatedAt: string;
  orgId: string;
  userId: string;
  timeZone: string;
  currency: string;
  namesRequired: boolean;
  thresholds: Thresholds;
  vessels: { id: string; name: string; capacity: number | null }[];
  routes: {
    id: string;
    label: string;
    durationMin: number;
    origin: { lat: number; lng: number; timeZone: string } | null;
    destination: { lat: number; lng: number } | null;
  }[];
  trips: {
    key: string;
    vesselId: string;
    label: string;
    scheduledDeparture: string | null;
    status: "scheduled" | "boarding" | "departed" | "arrived" | "cancelled";
    lifejackets: boolean;
    currency: string;
    /** Only for trips that haven't departed. */
    safety?: TripSafety;
  }[];
  manifest: {
    key: string;
    tripKey: string;
    name: string | null;
    seats: number;
    amendment: boolean;
    createdAt: string;
  }[];
}
