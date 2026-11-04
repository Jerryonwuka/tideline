// The safety lock rules (BUILD_SPEC §4.2, §10.3). Deterministic: the same inputs always give the same
// result. Runs on the server and, offline, on the captain's phone. Rules decide; nothing else can
// change the result.

export interface Thresholds {
  maxWindKmh: number;
  maxGustKmh: number;
  maxWaveM: number;
  maxPrecipMmH: number;
  nightBlock: boolean;
  /** "HH:MM" at the jetty, or null for no limit. */
  permittedStart: string | null;
  permittedEnd: string | null;
}

export interface WeatherPoint {
  time: string;
  windKmh: number | null;
  gustKmh: number | null;
  waveM: number | null;
  precipMmH: number | null;
  weatherCode: number | null;
  visibilityM: number | null;
}

export interface WeatherInput {
  fetchedAt: string;
  /** Hourly points at the origin and the route midpoint. */
  points: WeatherPoint[];
}

export interface SafetyInput {
  /** When the check runs. */
  now: Date;
  departure: Date;
  arrival: Date;
  /** The jetty's (or org's) IANA zone, for permitted hours. */
  timeZone: string;
  /** Null when the trip has no known location (no route). */
  sun: { sunrise: Date; sunset: Date } | null;
  thresholds: Thresholds;
  weather: WeatherInput | null;
  seats: number;
  capacity: number | null;
  lifejackets: boolean;
  /** Required vessel and captain documents that have expired (document type codes). */
  expiredDocuments: string[];
}

export type ReasonCode =
  | "weather_unknown"
  | "wind"
  | "wind_near_limit"
  | "gust"
  | "gust_near_limit"
  | "wave"
  | "wave_near_limit"
  | "precipitation"
  | "storm"
  | "low_visibility"
  | "location_unknown"
  | "night"
  | "outside_hours"
  | "capacity"
  | "lifejackets"
  | "documents_expired";

export interface Reason {
  code: ReasonCode;
  severity: "warn" | "block";
  value?: number | string;
  limit?: number | string;
  /** Capacity and life jackets can never be overridden. */
  overridable: boolean;
}

export type SafetyResult = "pass" | "warn" | "block";

export const WEATHER_MAX_AGE_MS = 3 * 60 * 60_000;
const NEAR_LIMIT = 0.8;
const MIN_VISIBILITY_M = 1000;
/** WMO codes 95–99: thunderstorm. */
const STORM_CODE = 95;
const HOUR_MS = 60 * 60_000;

/** "HH:MM" of an instant in a time zone. */
export function localTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    at,
  );
}

function maxOf(points: WeatherPoint[], pick: (p: WeatherPoint) => number | null): number | null {
  const values = points.map(pick).filter((v): v is number => v != null);
  return values.length ? Math.max(...values) : null;
}

function measured(
  reasons: Reason[],
  value: number | null,
  limit: number,
  over: ReasonCode,
  near: ReasonCode | null,
  severity: "warn" | "block" = "block",
) {
  if (value == null) return;
  const v = Math.round(value * 10) / 10;
  if (value > limit) reasons.push({ code: over, severity, value: v, limit, overridable: true });
  else if (near && value >= limit * NEAR_LIMIT)
    reasons.push({ code: near, severity: "warn", value: v, limit, overridable: true });
}

function weatherReasons(input: SafetyInput): Reason[] {
  const { weather, thresholds: t } = input;
  if (!weather || input.now.getTime() - Date.parse(weather.fetchedAt) > WEATHER_MAX_AGE_MS) {
    return [{ code: "weather_unknown", severity: "warn", overridable: true }];
  }
  const from = input.departure.getTime() - HOUR_MS;
  const to = input.arrival.getTime() + HOUR_MS;
  const window = weather.points.filter((p) => {
    const at = Date.parse(p.time);
    return at >= from && at <= to;
  });
  if (!window.length) return [{ code: "weather_unknown", severity: "warn", overridable: true }];

  const reasons: Reason[] = [];
  measured(
    reasons,
    maxOf(window, (p) => p.windKmh),
    t.maxWindKmh,
    "wind",
    "wind_near_limit",
  );
  measured(
    reasons,
    maxOf(window, (p) => p.gustKmh),
    t.maxGustKmh,
    "gust",
    "gust_near_limit",
  );
  measured(
    reasons,
    maxOf(window, (p) => p.waveM),
    t.maxWaveM,
    "wave",
    "wave_near_limit",
  );
  measured(
    reasons,
    maxOf(window, (p) => p.precipMmH),
    t.maxPrecipMmH,
    "precipitation",
    null,
  );
  const code = maxOf(window, (p) => p.weatherCode);
  if (code != null && code >= STORM_CODE)
    reasons.push({ code: "storm", severity: "block", value: code, overridable: true });
  const visibility = window.map((p) => p.visibilityM).filter((v): v is number => v != null);
  if (visibility.length && Math.min(...visibility) < MIN_VISIBILITY_M) {
    reasons.push({
      code: "low_visibility",
      severity: "warn",
      value: Math.min(...visibility),
      limit: MIN_VISIBILITY_M,
      overridable: true,
    });
  }
  return reasons;
}

function timeReasons(input: SafetyInput): Reason[] {
  const { thresholds: t, sun, timeZone } = input;
  const reasons: Reason[] = [];
  if (t.nightBlock) {
    if (!sun) reasons.push({ code: "location_unknown", severity: "warn", overridable: true });
    else if (input.departure < sun.sunrise || input.arrival > sun.sunset) {
      reasons.push({
        code: "night",
        severity: "block",
        value: `${localTime(input.departure, timeZone)}–${localTime(input.arrival, timeZone)}`,
        limit: `${localTime(sun.sunrise, timeZone)}–${localTime(sun.sunset, timeZone)}`,
        overridable: true,
      });
    }
  }
  const dep = localTime(input.departure, timeZone);
  const arr = localTime(input.arrival, timeZone);
  if ((t.permittedStart && dep < t.permittedStart) || (t.permittedEnd && (arr > t.permittedEnd || arr < dep))) {
    reasons.push({
      code: "outside_hours",
      severity: "block",
      value: `${dep}–${arr}`,
      limit: `${t.permittedStart ?? "00:00"}–${t.permittedEnd ?? "23:59"}`,
      overridable: true,
    });
  }
  return reasons;
}

export function evaluateSafety(input: SafetyInput): { result: SafetyResult; reasons: Reason[] } {
  const reasons = [...weatherReasons(input), ...timeReasons(input)];
  if (input.capacity != null && input.seats > input.capacity) {
    reasons.push({
      code: "capacity",
      severity: "block",
      value: input.seats,
      limit: input.capacity,
      overridable: false,
    });
  }
  if (!input.lifejackets) reasons.push({ code: "lifejackets", severity: "block", overridable: false });
  if (input.expiredDocuments.length) {
    reasons.push({
      code: "documents_expired",
      severity: "block",
      value: input.expiredDocuments.join(", "),
      overridable: true,
    });
  }
  const result: SafetyResult = reasons.some((r) => r.severity === "block") ? "block" : reasons.length ? "warn" : "pass";
  return { result, reasons };
}

/** A block someone may override: every blocking reason is overridable. */
export const canOverride = (reasons: Reason[]) =>
  reasons.some((r) => r.severity === "block") && reasons.every((r) => r.severity !== "block" || r.overridable);

/** Default trip length when a trip has no route (for the arrival estimate). */
export const DEFAULT_TRIP_MINUTES = 60;
