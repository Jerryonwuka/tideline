import { describe, expect, it } from "vitest";
import { knots, PAUSED_AFTER_MS, SAMPLE_MS, shouldRecord, trackingState } from "@/lib/offline/tracking";

const base = { supported: true, denied: false, visible: true, startedAt: 0, lastFixAt: 0, now: 0 };

describe("GPS tracking on the captain's phone", () => {
  it.each([
    ["fixes arriving", { lastFixAt: 100_000, now: 120_000 }, "tracking"],
    ["no fix for over 90 s: the browser stopped updates", { lastFixAt: 0, now: PAUSED_AFTER_MS + 1 }, "paused"],
    ["waiting for a first fix", { lastFixAt: null, now: 30_000 }, "tracking"],
    ["never got a fix", { lastFixAt: null, now: PAUSED_AFTER_MS + 1 }, "paused"],
    ["screen off / app in the background", { visible: false, lastFixAt: 100_000, now: 100_001 }, "paused"],
    ["location permission refused", { denied: true }, "denied"],
    ["no geolocation at all", { supported: false }, "unavailable"],
  ] as const)("%s → %s", (_, over, expected) => {
    expect(trackingState({ ...base, ...over })).toBe(expected);
  });

  it("records a point every 30 s from a fresh fix", () => {
    expect(shouldRecord(1000, null, 1000)).toBe(true);
    expect(shouldRecord(10_000, 1000, 10_000)).toBe(false);
    expect(shouldRecord(1000 + SAMPLE_MS, 1000, 1000 + SAMPLE_MS)).toBe(true);
    // A stale fix (over a minute old) isn't a new position.
    expect(shouldRecord(0, null, 61_000)).toBe(false);
  });

  it("converts m/s to knots", () => {
    expect(knots(5)).toBe(9.7);
    expect(knots(null)).toBeNull();
    expect(knots(Number.NaN)).toBeNull();
  });
});
