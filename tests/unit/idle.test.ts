import { describe, expect, it } from "vitest";
import { areaMatch, median, rankBuyers, sizeBand, suggestPrice, type PriceInputs } from "@/lib/idle";
import { devIdleListing, devIdleOutreach } from "@/server/integrations/llm/dev-idle";
import { idleListingMessage, idleListingSchema, idleOutreachPrompt } from "@/server/ai/prompts/idle";
import { unsupportedFigures } from "@/lib/tenders";

const base: PriceInputs = {
  currency: "NGN",
  vesselRates: [],
  orgSameTypeRates: [],
  boardRates: [],
  idleDays: 3,
  minRateMinor: null,
};
const ngn = (major: number) => BigInt(major) * 100n;

describe("price suggestion (rules first)", () => {
  it("median of the vessel's last charters is the baseline", () => {
    const s = suggestPrice({ ...base, vesselRates: [ngn(1_000_000), ngn(1_400_000), ngn(1_200_000)] });
    expect(s.rateMinor).toBe(ngn(1_200_000));
    expect(s.inputs.baseline_source).toBe("vessel");
    expect(s.inputs.vessel_charters).toBe(3);
  });

  it("only the last 5 charters count", () => {
    const s = suggestPrice({ ...base, vesselRates: [1, 1, 1, 1, 1, 9, 9, 9].map((n) => ngn(n * 100_000)) });
    expect(s.rateMinor).toBe(ngn(100_000));
  });

  it("falls back to the org's same-type charters, then the board", () => {
    expect(suggestPrice({ ...base, orgSameTypeRates: [ngn(800_000)] }).inputs.baseline_source).toBe("org_same_type");
    const b = suggestPrice({ ...base, boardRates: [ngn(900_000), ngn(1_100_000)] });
    expect(b.inputs.baseline_source).toBe("board");
    expect(b.rateMinor).toBe(ngn(1_000_000));
  });

  it("moves halfway toward the board median", () => {
    const s = suggestPrice({ ...base, vesselRates: [ngn(1_000_000)], boardRates: [ngn(1_400_000)] });
    expect(s.rateMinor).toBe(ngn(1_200_000));
  });

  it("drops 5% per full week idle, at most 30%", () => {
    expect(suggestPrice({ ...base, vesselRates: [ngn(1_000_000)], idleDays: 6 }).rateMinor).toBe(ngn(1_000_000));
    expect(suggestPrice({ ...base, vesselRates: [ngn(1_000_000)], idleDays: 15 }).rateMinor).toBe(ngn(900_000));
    const long = suggestPrice({ ...base, vesselRates: [ngn(1_000_000)], idleDays: 200 });
    expect(long.inputs.reduction_bps).toBe(3000);
    expect(long.rateMinor).toBe(ngn(700_000));
  });

  it("is never below the owner's minimum rate", () => {
    for (const idleDays of [3, 10, 30, 90, 365]) {
      const s = suggestPrice({
        ...base,
        vesselRates: [ngn(1_000_000)],
        boardRates: [ngn(500_000)],
        idleDays,
        minRateMinor: ngn(850_000),
      });
      expect(s.rateMinor! >= ngn(850_000)).toBe(true);
    }
    expect(
      suggestPrice({ ...base, vesselRates: [ngn(1_000_000)], idleDays: 60, minRateMinor: ngn(950_000) }).inputs.floored,
    ).toBe(true);
  });

  it("no suggestion without any rate to go on", () => {
    const s = suggestPrice({ ...base, minRateMinor: ngn(500_000) });
    expect(s.rateMinor).toBeNull();
    expect(s.inputs.baseline_source).toBe("none");
  });

  it("rounds to whole currency units, in integers", () => {
    expect(suggestPrice({ ...base, vesselRates: [123_456_789n] }).rateMinor).toBe(123_456_800n);
    expect(median([1n, 2n, 3n, 4n])).toBe(2n);
  });
});

describe("buyer ranking (no LLM)", () => {
  const ranked = rankBuyers([
    { orgId: "a", name: "Busy Searcher", pastCharters: 0, similarRequests: 10, similarSearches: 20, areaMatch: true },
    { orgId: "b", name: "Past Client", pastCharters: 1, similarRequests: 0, similarSearches: 0, areaMatch: false },
    { orgId: "c", name: "Area Only", pastCharters: 0, similarRequests: 0, similarSearches: 0, areaMatch: true },
    { orgId: "d", name: "Nothing", pastCharters: 0, similarRequests: 0, similarSearches: 0, areaMatch: false },
  ]);

  it("past clients rank above other charterers", () => {
    expect(ranked[0]!.name).toBe("Past Client");
    expect(ranked[0]!.reasons).toEqual(["past_client"]);
  });
  it("then demand for the type, then area; no signal means not listed", () => {
    expect(ranked.map((b) => b.name)).toEqual(["Past Client", "Busy Searcher", "Area Only"]);
  });
});

describe("areas and sizes", () => {
  it("areas match on a shared place word", () => {
    expect(areaMatch("Bonny and Onne", "Onne terminal")).toBe(true);
    expect(areaMatch("Lagos", "Port Harcourt")).toBe(false);
    expect(areaMatch(null, "Onne")).toBe(false);
  });
  it("size bands", () => {
    expect(sizeBand(15)).toBe(0);
    expect(sizeBand(32)).toBe(1);
    expect(sizeBand(50)).toBe(2);
    expect(sizeBand(80)).toBe(3);
    expect(sizeBand(null)).toBeNull();
  });
});

describe("listing text uses the profile and numbers only (local stand-in)", () => {
  const vessel = { name: "MV Onne Star", type: "crew_boat", length_m: 32, year_built: 2015, area: "Onne" };
  const pricing = { rate: "NGN 1,200,000.00", inputs: { baseline_source: "vessel", weeks_idle: 1, board_listings: 2 } };
  it("matches the schema and adds no figures", () => {
    const out = idleListingSchema.parse(devIdleListing(idleListingMessage(vessel, pricing)));
    const sources = [JSON.stringify(vessel), JSON.stringify(pricing)];
    expect(unsupportedFigures(out.rationale, ...sources)).toEqual([]);
    expect(unsupportedFigures(out.description, ...sources)).toEqual([]);
  });
  it("outreach names both sides and the rate", () => {
    const text = devIdleOutreach(idleOutreachPrompt("Onne Marine", "Gulf Energy Ltd", vessel, "NGN 1,200,000.00"));
    expect(text).toContain("Gulf Energy Ltd");
    expect(text).toContain("NGN 1,200,000.00");
  });
});
