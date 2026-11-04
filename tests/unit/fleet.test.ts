import { describe, expect, it } from "vitest";
import { datesInOrder, effectiveStatus } from "@/lib/documents";
import { fitWithin } from "@/lib/image";
import { vesselInputSchema } from "@/lib/schemas/fleet";

describe("effectiveStatus (mirrors public.effective_document_status)", () => {
  const today = "2026-11-04";
  it.each([
    ["valid", "2027-06-01", "valid"],
    ["valid", "2026-12-04", "expiring"],
    ["valid", "2026-12-05", "valid"],
    ["valid", "2026-11-04", "expiring"],
    ["valid", "2026-11-03", "expired"],
    ["valid", null, "valid"],
    ["needs_review", "2020-01-01", "needs_review"],
    ["rejected", "2030-01-01", "rejected"],
  ] as const)("%s with expiry %s → %s", (stored, expiry, expected) => {
    expect(effectiveStatus(stored, expiry, today)).toBe(expected);
  });

  it("respects a custom expiring window", () => {
    expect(effectiveStatus("valid", "2026-11-20", today, 7)).toBe("valid");
  });
});

describe("dates and sizes", () => {
  it("rejects an expiry before the issue date", () => {
    expect(datesInOrder("2026-01-01", "2025-12-31")).toBe(false);
    expect(datesInOrder("2026-01-01", "2026-01-01")).toBe(true);
    expect(datesInOrder(undefined, "2026-01-01")).toBe(true);
  });

  it("fits photos within 1600 px on the longest edge, keeping the aspect ratio", () => {
    expect(fitWithin(2400, 1200)).toEqual({ width: 1600, height: 800, resized: true });
    expect(fitWithin(1200, 3000)).toEqual({ width: 640, height: 1600, resized: true });
    expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900, resized: false });
  });
});

describe("vessel input", () => {
  it("validates IMO and MMSI formats and coerces numbers from forms", () => {
    const ok = vesselInputSchema.parse({ name: "MV Star", type: "ferry", imo: "9123456", passengerCapacity: "50" });
    expect(ok.passengerCapacity).toBe(50);
    expect(vesselInputSchema.safeParse({ name: "MV Star", type: "ferry", imo: "12" }).success).toBe(false);
    expect(vesselInputSchema.safeParse({ name: "MV Star", type: "ferry", mmsi: "123456789" }).success).toBe(true);
    expect(vesselInputSchema.parse({ name: "MV Star", type: "ferry", imo: "" }).imo).toBeUndefined();
  });
});
