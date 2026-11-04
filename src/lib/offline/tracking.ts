// GPS sampling rules for captain phones (§8): a point every 30 s while a trip is departed and the
// screen is on. Browsers stop location updates when the screen locks or the app is in the
// background, so the screen shows "Tracking paused" when fixes stop arriving.

export const SAMPLE_MS = 30_000;
/** No fix for this long means the browser has stopped sending updates. */
export const PAUSED_AFTER_MS = 90_000;
/** A fix older than this isn't recorded as a new point. */
export const MAX_FIX_AGE_MS = 60_000;

export type TrackingState = "tracking" | "paused" | "denied" | "unavailable";

export function trackingState(input: {
  supported: boolean;
  denied: boolean;
  visible: boolean;
  lastFixAt: number | null;
  startedAt: number;
  now: number;
}): TrackingState {
  if (!input.supported) return "unavailable";
  if (input.denied) return "denied";
  if (!input.visible) return "paused";
  const since = input.lastFixAt ?? input.startedAt;
  return input.now - since > PAUSED_AFTER_MS ? "paused" : "tracking";
}

/** Whether a fix should be recorded now: fresh, and at least SAMPLE_MS after the last point. */
export function shouldRecord(fixAt: number, lastRecordedAt: number | null, now: number): boolean {
  if (now - fixAt > MAX_FIX_AGE_MS) return false;
  return lastRecordedAt === null || now - lastRecordedAt >= SAMPLE_MS - 500;
}

/** m/s (Geolocation) → knots. */
export const knots = (metresPerSecond: number | null) =>
  metresPerSecond == null || Number.isNaN(metresPerSecond) ? null : Math.round(metresPerSecond * 1.943844 * 10) / 10;
