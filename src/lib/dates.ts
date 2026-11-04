import { fromZonedTime } from "date-fns-tz";

/**
 * Instants are stored as UTC (timestamptz) and shown in an IANA zone resolved per user → org → jetty.
 * Calendar dates (document expiry) are plain "YYYY-MM-DD" strings with no time or zone.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const zoneCache = new Map<string, boolean>();

export function isValidTimeZone(timeZone: string): boolean {
  let ok = zoneCache.get(timeZone);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat("en", { timeZone });
      ok = true;
    } catch {
      ok = false;
    }
    zoneCache.set(timeZone, ok);
  }
  return ok;
}

function assertZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Unknown IANA time zone: ${timeZone}`);
}

/** ISO 8601 UTC string for storage and APIs. */
export function toUtcIso(date: Date): string {
  return date.toISOString();
}

/** Picks the first usable zone, e.g. resolveTimeZone(profile.time_zone, org.time_zone). */
export function resolveTimeZone(...candidates: (string | null | undefined)[]): string {
  const zone = candidates.find((z): z is string => !!z && isValidTimeZone(z));
  if (!zone) throw new RangeError("No valid time zone among candidates");
  return zone;
}

/** Display an instant in a zone and locale. */
export function formatInZone(
  date: Date,
  timeZone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  assertZone(timeZone);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  assertZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** Local calendar date ("YYYY-MM-DD") of an instant in a zone — used for "expires today". */
export function localDate(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Local hour (0–23); hourly UTC cron jobs use this to pick orgs whose local time is e.g. 07:00. */
export function localHour(date: Date, timeZone: string): number {
  return zonedParts(date, timeZone).hour;
}

/** Converts a wall-clock time in a zone ("2026-11-04T07:30") to the UTC instant. */
export function zonedTimeToUtc(localDateTime: string, timeZone: string): Date {
  assertZone(timeZone);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(localDateTime)) {
    throw new RangeError(`Expected YYYY-MM-DDTHH:mm, got "${localDateTime}"`);
  }
  return fromZonedTime(localDateTime, timeZone);
}

export function assertCalendarDate(value: string): void {
  if (!DATE_RE.test(value)) throw new RangeError(`Expected YYYY-MM-DD, got "${value}"`);
  const [y = 0, m = 0, d = 0] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new RangeError(`Not a real date: "${value}"`);
  }
}

/** Whole days from `a` to `b`, both calendar dates. */
export function daysBetween(a: string, b: string): number {
  assertCalendarDate(a);
  assertCalendarDate(b);
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Days until a calendar date as seen from `now` in a zone: 0 = today, negative = past. */
export function daysUntil(calendarDate: string, now: Date, timeZone: string): number {
  return daysBetween(localDate(now, timeZone), calendarDate);
}

export function addDays(calendarDate: string, days: number): string {
  assertCalendarDate(calendarDate);
  const d = new Date(Date.parse(`${calendarDate}T00:00:00Z`) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
