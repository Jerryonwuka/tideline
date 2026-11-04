import { describe, expect, it } from "vitest";
import { canOverride, evaluateSafety, type SafetyInput, type WeatherPoint } from "@/lib/safety/engine";
import { sunTimes } from "@/lib/safety/sun";

// 2026-11-04, Lagos (UTC+1). Sunrise ~06:34, sunset ~18:26 local (solar noon ~12:30).
const ZONE = "Africa/Lagos";
const at = (hhmm: string) => new Date(`2026-11-04T${hhmm}:00+01:00`);
const calm: Omit<WeatherPoint, "time"> = {
  windKmh: 10,
  gustKmh: 15,
  waveM: 0.3,
  precipMmH: 0,
  weatherCode: 1,
  visibilityM: 10_000,
};
const hourly = (over: Partial<WeatherPoint> = {}) =>
  Array.from({ length: 24 }, (_, h) => ({ ...calm, ...over, time: new Date(Date.UTC(2026, 10, 4, h)).toISOString() }));

function input(over: Partial<SafetyInput> = {}): SafetyInput {
  return {
    now: at("11:00"),
    departure: at("11:00"),
    arrival: at("11:45"),
    timeZone: ZONE,
    sun: { sunrise: at("06:34"), sunset: at("18:26") },
    thresholds: {
      maxWindKmh: 30,
      maxGustKmh: 40,
      maxWaveM: 1,
      maxPrecipMmH: 10,
      nightBlock: true,
      permittedStart: null,
      permittedEnd: null,
    },
    // Fetched an hour before the check unless a case says otherwise.
    weather: { fetchedAt: new Date((over.now ?? at("11:00")).getTime() - 3_600_000).toISOString(), points: hourly() },
    seats: 10,
    capacity: 20,
    lifejackets: true,
    expiredDocuments: [],
    ...over,
  };
}

const codes = (i: SafetyInput) => evaluateSafety(i).reasons.map((r) => `${r.severity}:${r.code}`);

describe("safety engine", () => {
  it.each<[string, Partial<SafetyInput>, "pass" | "warn" | "block", string[]]>([
    ["calm day, all good", {}, "pass", []],
    [
      "wind over the limit",
      { weather: { fetchedAt: at("10:00").toISOString(), points: hourly({ windKmh: 35 }) } },
      "block",
      ["block:wind"],
    ],
    [
      "wind near the limit",
      { weather: { fetchedAt: at("10:00").toISOString(), points: hourly({ windKmh: 25 }) } },
      "warn",
      ["warn:wind_near_limit"],
    ],
    [
      "gusts over",
      { weather: { fetchedAt: at("10:00").toISOString(), points: hourly({ gustKmh: 41 }) } },
      "block",
      ["block:gust"],
    ],
    [
      "waves over",
      { weather: { fetchedAt: at("10:00").toISOString(), points: hourly({ waveM: 1.4 }) } },
      "block",
      ["block:wave"],
    ],
    [
      "heavy rain",
      { weather: { fetchedAt: at("10:00").toISOString(), points: hourly({ precipMmH: 12 }) } },
      "block",
      ["block:precipitation"],
    ],
    [
      "thunderstorm",
      { weather: { fetchedAt: at("10:00").toISOString(), points: hourly({ weatherCode: 95 }) } },
      "block",
      ["block:storm"],
    ],
    [
      "fog",
      { weather: { fetchedAt: at("10:00").toISOString(), points: hourly({ visibilityM: 400 }) } },
      "warn",
      ["warn:low_visibility"],
    ],
    ["no weather", { weather: null }, "warn", ["warn:weather_unknown"]],
    [
      "weather older than 3 hours",
      { weather: { fetchedAt: at("07:59").toISOString(), points: hourly() } },
      "warn",
      ["warn:weather_unknown"],
    ],
    [
      "weather just under 3 hours old",
      { weather: { fetchedAt: at("08:01").toISOString(), points: hourly() } },
      "pass",
      [],
    ],
    [
      "departs before sunrise",
      { now: at("06:00"), departure: at("06:00"), arrival: at("06:45") },
      "block",
      ["block:night"],
    ],
    [
      "arrives after sunset",
      { now: at("18:00"), departure: at("18:00"), arrival: at("18:45") },
      "block",
      ["block:night"],
    ],
    [
      "night rule off",
      {
        now: at("19:00"),
        departure: at("19:00"),
        arrival: at("19:45"),
        thresholds: { ...input().thresholds, nightBlock: false },
      },
      "pass",
      [],
    ],
    ["no location", { sun: null }, "warn", ["warn:location_unknown"]],
    [
      "outside permitted hours",
      { thresholds: { ...input().thresholds, permittedEnd: "11:30" } },
      "block",
      ["block:outside_hours"],
    ],
    ["over capacity", { seats: 21 }, "block", ["block:capacity"]],
    ["at capacity", { seats: 20 }, "pass", []],
    ["life jackets not checked", { lifejackets: false }, "block", ["block:lifejackets"]],
    ["expired licence", { expiredDocuments: ["laswa_licence"] }, "block", ["block:documents_expired"]],
  ])("%s", (_, over, result, reasons) => {
    const i = input(over);
    expect(evaluateSafety(i).result).toBe(result);
    expect(codes(i)).toEqual(reasons);
  });

  it("weather outside the trip window doesn't count", () => {
    const points = hourly().map((p) => (Date.parse(p.time) > at("15:00").getTime() ? { ...p, windKmh: 80 } : p));
    expect(evaluateSafety(input({ weather: { fetchedAt: at("10:00").toISOString(), points } })).result).toBe("pass");
  });

  it("reasons carry the measured value and the limit", () => {
    const { reasons } = evaluateSafety(
      input({ weather: { fetchedAt: at("10:00").toISOString(), points: hourly({ windKmh: 35.26 }) } }),
    );
    expect(reasons[0]).toEqual({ code: "wind", severity: "block", value: 35.3, limit: 30, overridable: true });
  });

  it("capacity and life-jacket blocks can never be overridden", () => {
    expect(canOverride(evaluateSafety(input({ expiredDocuments: ["x"] })).reasons)).toBe(true);
    expect(canOverride(evaluateSafety(input({ seats: 30 })).reasons)).toBe(false);
    expect(canOverride(evaluateSafety(input({ lifejackets: false, expiredDocuments: ["x"] })).reasons)).toBe(false);
    expect(canOverride(evaluateSafety(input()).reasons)).toBe(false);
  });
});

describe("sunrise and sunset", () => {
  const close = (a: Date, hhmm: string) => Math.abs(a.getTime() - at(hhmm).getTime()) / 60_000;

  it("Lagos, 4 November: about 06:34 and 18:26", () => {
    const sun = sunTimes("2026-11-04", 6.4541, 3.3947)!;
    expect(close(sun.sunrise, "06:34")).toBeLessThan(5);
    expect(close(sun.sunset, "18:26")).toBeLessThan(5);
  });

  it("no sunset in the polar summer", () => {
    expect(sunTimes("2026-06-21", 78.2, 15.6)).toBeNull();
  });
});
