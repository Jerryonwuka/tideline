import type { CaptainSnapshot, TripStep } from "@/lib/schemas/sync";

// The phone's copy of the database rules (M4 triggers), so a captain with no signal gets the same
// answer the server would give: capacity is a hard limit, status only moves forward, departure needs
// the life-jacket check and at least one person, and the manifest locks at departure (later
// additions are amendments). The server stays the authority; this only avoids queueing ops that
// would be rejected.

export type TripStatus = CaptainSnapshot["trips"][number]["status"];
export type LocalTrip = CaptainSnapshot["trips"][number] & { synced: boolean };
export type LocalEntry = CaptainSnapshot["manifest"][number] & { synced: boolean };
export type LocalError =
  | "capacity_exceeded"
  | "invalid_transition"
  | "lifejackets_unconfirmed"
  | "trip_closed"
  | "validation"
  | "safety_check_required"
  | "safety_unacknowledged"
  | "safety_blocked";

/** A departure needs a safety check from the last hour (the server's rule, §4.2). */
export const CHECK_VALID_MS = 60 * 60_000;

/** Why the safety lock stops departure now, or null when it doesn't. */
export function safetyClearance(trip: LocalTrip, now: Date): LocalError | null {
  const latest = trip.safety?.latest;
  if (!latest || now.getTime() - Date.parse(latest.checkedAt) > CHECK_VALID_MS) return "safety_check_required";
  if (latest.result === "pass") return null;
  if (latest.result === "warn") return latest.acknowledged ? null : "safety_unacknowledged";
  return latest.decision?.decision === "approved" ? null : "safety_blocked";
}

const NEXT: Record<TripStatus, TripStatus[]> = {
  scheduled: ["boarding", "departed", "cancelled"],
  boarding: ["departed", "cancelled"],
  departed: ["arrived"],
  arrived: [],
  cancelled: [],
};

const STEP_STATUS: Partial<Record<TripStep, TripStatus>> = {
  boarding: "boarding",
  depart: "departed",
  arrive: "arrived",
  cancel: "cancelled",
};

export const isClosed = (s: TripStatus) => s === "arrived" || s === "cancelled";
export const isOpen = (s: TripStatus) => s === "scheduled" || s === "boarding";

export const seatsOf = (entries: Pick<LocalEntry, "seats">[]) => entries.reduce((n, e) => n + e.seats, 0);

/** Why a step can't happen now, or null when it can. */
export function checkStep(trip: LocalTrip, seats: number, step: TripStep, now = new Date()): LocalError | null {
  if (isClosed(trip.status)) return "trip_closed";
  if (step === "lifejackets") return isOpen(trip.status) ? null : "invalid_transition";
  const to = STEP_STATUS[step];
  if (!to || !NEXT[trip.status].includes(to)) return "invalid_transition";
  if (step === "depart" && !trip.lifejackets) return "lifejackets_unconfirmed";
  if (step === "depart" && seats === 0) return "validation";
  if (step === "depart") return safetyClearance(trip, now);
  return null;
}

/** The trip after a step (call checkStep first). */
export function applyStep(trip: LocalTrip, step: TripStep, confirmed?: boolean): LocalTrip {
  if (step === "lifejackets") return { ...trip, lifejackets: confirmed ?? !trip.lifejackets, synced: false };
  return { ...trip, status: STEP_STATUS[step] ?? trip.status, synced: false };
}

/** Why seats can't be added now, or null. Over capacity is never allowed, before or after departure. */
export function checkAdd(trip: LocalTrip, seats: number, capacity: number | null, add: number): LocalError | null {
  if (isClosed(trip.status)) return "trip_closed";
  if (!Number.isInteger(add) || add < 1 || add > 50) return "validation";
  if (capacity != null && seats + add > capacity) return "capacity_exceeded";
  return null;
}

/** Entries added after departure are amendments. */
export const isAmendment = (trip: LocalTrip) => trip.status === "departed";

/** Only before departure can people be taken off the manifest. */
export const canRemove = (trip: LocalTrip) => isOpen(trip.status);
