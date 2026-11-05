import { describe, expect, it } from "vitest";
import {
  applyAnswer,
  digitise,
  heuristicDraft,
  missingFields,
  parseTripSms,
  placesIn,
  type BotContext,
} from "@/server/bot/parse";

const ctx: BotContext = {
  vessels: [{ id: "v1", name: "MV Lagos One" }],
  routes: [
    {
      id: "r1",
      origin: "CMS Marina",
      destination: "Ikorodu",
      originAliases: ["CMS", "Marina"],
      destinationAliases: ["Ikorodu Terminal", "IKD"],
    },
    {
      id: "r2",
      origin: "Ikorodu",
      destination: "CMS Marina",
      originAliases: ["Ikorodu Terminal", "IKD"],
      destinationAliases: ["CMS", "Marina"],
    },
  ],
  openTrips: [],
  currency: "NGN",
};

describe("number words", () => {
  it.each([
    ["Trip four CMS to Ikorodu eighteen passengers twenty-seven thousand", "trip 4 cms to ikorodu 18 passengers 27000"],
    ["twenty seven k", "27000"],
    ["27k naira", "27000 naira"],
    ["fuel 40k", "fuel 40000"],
    ["one hundred and twenty", "120"],
    ["1.5m", "1500000"],
    ["27,000", "27000"],
    ["two thousand five hundred", "2500"],
  ])("%s", (input, expected) => {
    expect(digitise(input)).toBe(expected);
  });
});

describe("rule-based draft (local stand-in for the AI)", () => {
  it("reads the acceptance fixture into a trip log", () => {
    expect(heuristicDraft("Trip four CMS to Ikorodu eighteen passengers twenty-seven thousand", ctx)).toMatchObject({
      kind: "trip_log",
      vessel_id: "v1",
      route_id: "r1",
      origin: "CMS Marina",
      destination: "Ikorodu",
      passenger_count: 18,
      amount: 27000,
      currency: "NGN",
      urgent: false,
    });
  });

  it("flags danger as an urgent incident", () => {
    expect(heuristicDraft("Boat don capsize near Ikorodu, people missing", ctx)).toMatchObject({
      kind: "incident",
      urgent: true,
    });
  });

  it("reads fuel and expenses", () => {
    expect(heuristicDraft("Fuel 40k", ctx)).toMatchObject({ kind: "fuel", amount: 40000, expense_category: "fuel" });
    expect(heuristicDraft("Paid levy 5000 cash", ctx)).toMatchObject({
      kind: "expense",
      expense_category: "levy",
      amount: 5000,
      payment_method: "cash",
    });
  });

  it("finds places in order, by name or alias", () => {
    expect(placesIn("from IKD going to marina", ctx)).toEqual(["Ikorodu", "CMS Marina"]);
  });
});

describe("SMS fallback format", () => {
  it("parses TRIP 4 CMS IKD 18 27000", () => {
    expect(parseTripSms("TRIP 4 CMS IKD 18 27000", ctx)).toMatchObject({
      kind: "trip_log",
      route_id: "r1",
      passenger_count: 18,
      amount: 27000,
    });
  });
  it("rejects other texts", () => {
    expect(parseTripSms("hello", ctx)).toBeNull();
    expect(parseTripSms("TRIP 4 NOWHERE IKD 18", ctx)).toBeNull();
  });
});

describe("one question at a time", () => {
  it("asks for the missing fields in order and fills them from short answers", () => {
    const twoVessels = { ...ctx, vessels: [...ctx.vessels, { id: "v2", name: "MV Ajah" }] };
    let d = heuristicDraft("Trip from CMS to IKD", twoVessels);
    expect(missingFields(d)).toEqual(["vessel_id", "passenger_count"]);
    d = applyAnswer(d, "vessel_id", "Ajah", twoVessels);
    expect(d.vessel_id).toBe("v2");
    d = applyAnswer(d, "passenger_count", "twenty two", twoVessels);
    expect(d.passenger_count).toBe(22);
    expect(missingFields(d)).toEqual([]);
  });
});
