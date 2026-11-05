import "server-only";
import { devToolsEnabled } from "./env";

// The safety rules depend on the time of day (night, permitted hours). Local tests pin the clock
// (POST /api/dev/clock) so they give the same answer whenever they run. Time keeps moving from the
// pinned instant. Anywhere but APP_ENV=local with fakes this is always the real time.

const holder = globalThis as unknown as { __tidelineClockOffsetMs?: number };

export function now(): Date {
  const offset = devToolsEnabled() ? (holder.__tidelineClockOffsetMs ?? 0) : 0;
  return new Date(Date.now() + offset);
}

export function setClockForDev(at: Date | null): void {
  holder.__tidelineClockOffsetMs = at ? at.getTime() - Date.now() : 0;
}
