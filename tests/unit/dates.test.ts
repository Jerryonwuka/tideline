import { describe, expect, it } from "vitest";
import {
  addDays,
  assertCalendarDate,
  daysBetween,
  daysUntil,
  formatInZone,
  isValidTimeZone,
  localDate,
  localHour,
  resolveTimeZone,
  toUtcIso,
  zonedTimeToUtc,
} from "@/lib/dates";

// Two zones on purpose: a launch-market zone and a test zone with DST, so nothing assumes one zone.
const LAGOS = "Africa/Lagos"; // UTC+1, no DST
const CHICAGO = "America/Chicago"; // UTC-6/-5 with DST

describe("time zones", () => {
  it("validates IANA zones", () => {
    expect(isValidTimeZone(LAGOS)).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });

  it("resolves user → org → jetty, skipping empty or invalid values", () => {
    expect(resolveTimeZone(null, "Nope/Zone", CHICAGO, LAGOS)).toBe(CHICAGO);
    expect(() => resolveTimeZone(null, undefined)).toThrow(RangeError);
  });

  it("stores UTC and displays in the zone", () => {
    const instant = new Date("2026-11-04T17:52:00Z");
    expect(toUtcIso(instant)).toBe("2026-11-04T17:52:00.000Z");
    expect(formatInZone(instant, LAGOS, "en-NG", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe(
      "18:52",
    );
    expect(formatInZone(instant, CHICAGO, "en-US", { hour: "numeric", minute: "2-digit" })).toBe("11:52 AM");
  });

  it("converts local wall-clock time to UTC", () => {
    expect(zonedTimeToUtc("2026-11-04T07:00", LAGOS).toISOString()).toBe("2026-11-04T06:00:00.000Z");
    // Chicago is on CST (UTC-6) after 1 Nov 2026 and CDT (UTC-5) before.
    expect(zonedTimeToUtc("2026-11-04T07:00", CHICAGO).toISOString()).toBe("2026-11-04T13:00:00.000Z");
    expect(zonedTimeToUtc("2026-10-28T07:00", CHICAGO).toISOString()).toBe("2026-10-28T12:00:00.000Z");
  });

  it("gives the local hour used by hourly cron jobs", () => {
    const at0600Z = new Date("2026-11-04T06:00:00Z");
    expect(localHour(at0600Z, LAGOS)).toBe(7);
    expect(localHour(at0600Z, CHICAGO)).toBe(0);
  });

  it("gives the local calendar date across midnight", () => {
    const late = new Date("2026-11-04T23:30:00Z");
    expect(localDate(late, LAGOS)).toBe("2026-11-05");
    expect(localDate(late, CHICAGO)).toBe("2026-11-04");
  });
});

describe("calendar dates", () => {
  it("rejects impossible dates", () => {
    expect(() => assertCalendarDate("2026-02-30")).toThrow(RangeError);
    expect(() => assertCalendarDate("05/06/2026")).toThrow(RangeError);
    expect(() => assertCalendarDate("2028-02-29")).not.toThrow();
  });

  it("counts days and adds days", () => {
    expect(daysBetween("2026-11-04", "2027-02-02")).toBe(90);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-02-02", -90)).toBe("2026-11-04");
  });

  it("computes 'expires today' in the org's zone", () => {
    const now = new Date("2026-11-04T23:30:00Z");
    expect(daysUntil("2026-11-05", now, LAGOS)).toBe(0);
    expect(daysUntil("2026-11-05", now, CHICAGO)).toBe(1);
    expect(daysUntil("2026-11-01", now, CHICAGO)).toBe(-3);
  });
});
