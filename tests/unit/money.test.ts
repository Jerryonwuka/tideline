import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  add,
  compare,
  divRoundHalfEven,
  formatMoney,
  fromJson,
  fromMajor,
  minorUnitDigits,
  money,
  multiply,
  percentBps,
  subtract,
  sum,
  toJson,
  toMajorString,
  totalsByCurrency,
} from "@/lib/money";

describe("money()", () => {
  it("stores integer minor units as bigint", () => {
    expect(money(2_700_000, "NGN").amountMinor).toBe(2_700_000n);
  });

  it("rejects floats and bad currency codes", () => {
    expect(() => money(10.5, "NGN")).toThrow(RangeError);
    expect(() => money(1, "ngn")).toThrow(RangeError);
    expect(() => money(1, "XYZ1")).toThrow(RangeError);
  });

  it("reads minor-unit digits from ISO data", () => {
    expect(minorUnitDigits("NGN")).toBe(2);
    expect(minorUnitDigits("USD")).toBe(2);
    expect(minorUnitDigits("JPY")).toBe(0);
  });
});

describe("arithmetic", () => {
  it("adds and subtracts the same currency", () => {
    expect(add(money(100, "NGN"), money(250, "NGN")).amountMinor).toBe(350n);
    expect(subtract(money(100, "USD"), money(250, "USD")).amountMinor).toBe(-150n);
  });

  it("never mixes currencies", () => {
    expect(() => add(money(1, "NGN"), money(1, "USD"))).toThrow(CurrencyMismatchError);
    expect(() => sum([money(1, "NGN"), money(1, "USD")])).toThrow(CurrencyMismatchError);
    expect(() => compare(money(1, "NGN"), money(1, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("multiplies by whole numbers only", () => {
    expect(multiply(money(150_000_00, "NGN"), 3).amountMinor).toBe(450_000_00n);
    expect(() => multiply(money(1, "NGN"), 1.5)).toThrow(RangeError);
  });

  it("totals per currency without converting", () => {
    const totals = totalsByCurrency([money(100, "USD"), money(5_000, "NGN"), money(50, "USD")]);
    expect(totals.map(toJson)).toEqual([
      { amount_minor: "5000", currency: "NGN" },
      { amount_minor: "150", currency: "USD" },
    ]);
  });

  it("sum of an empty list needs a currency", () => {
    expect(() => sum([])).toThrow(RangeError);
    expect(sum([], "NGN").amountMinor).toBe(0n);
  });
});

describe("banker's rounding and fees", () => {
  it.each([
    [5n, 10n, 0n], // 0.5 → 0 (even)
    [15n, 10n, 2n], // 1.5 → 2 (even)
    [25n, 10n, 2n], // 2.5 → 2 (even)
    [26n, 10n, 3n],
    [24n, 10n, 2n],
    [-25n, 10n, -2n],
    [-15n, 10n, -2n],
  ])("divRoundHalfEven(%s, %s) = %s", (n, d, expected) => {
    expect(divRoundHalfEven(n, d)).toBe(expected);
  });

  it("computes a 1% ticket fee in NGN", () => {
    // ₦1,500.00 × 1% = ₦15.00
    expect(percentBps(money(150_000, "NGN"), 100).amountMinor).toBe(1_500n);
  });

  it("rounds a fee half to even at the minor unit", () => {
    // $0.50 × 1% = 0.5 cents → 0; $1.50 × 1% = 1.5 cents → 2
    expect(percentBps(money(50, "USD"), 100).amountMinor).toBe(0n);
    expect(percentBps(money(150, "USD"), 100).amountMinor).toBe(2n);
  });

  it("rejects fractional bps", () => {
    expect(() => percentBps(money(100, "USD"), 1.5)).toThrow(RangeError);
  });
});

describe("parsing and formatting", () => {
  it("parses major-unit strings without floats", () => {
    expect(fromMajor("27000", "NGN").amountMinor).toBe(2_700_000n);
    expect(fromMajor("27,000.5", "NGN").amountMinor).toBe(2_700_050n);
    expect(fromMajor("-3.05", "USD").amountMinor).toBe(-305n);
    expect(fromMajor("90071992547409.93", "USD").amountMinor).toBe(9_007_199_254_740_993n);
    expect(() => fromMajor("1.001", "USD")).toThrow(RangeError);
    expect(() => fromMajor("abc", "USD")).toThrow(RangeError);
  });

  it("round-trips through major strings and JSON", () => {
    const m = money(2_700_050n, "NGN");
    expect(toMajorString(m)).toBe("27000.50");
    expect(toMajorString(money(-5, "USD"))).toBe("-0.05");
    expect(toMajorString(money(500, "JPY"))).toBe("500");
    expect(fromJson(toJson(m))).toEqual(m);
  });

  it("formats NGN and USD by locale", () => {
    expect(formatMoney(money(2_700_000, "NGN"), "en-NG")).toBe("₦27,000.00");
    expect(formatMoney(money(2_700_000, "NGN"), "en-NG", { hideZeroFraction: true })).toBe("₦27,000");
    expect(formatMoney(money(10_050, "USD"), "en-US")).toBe("$100.50");
    expect(formatMoney(money(10_050, "USD"), "fr").replace(/\s/g, " ")).toBe("100,50 $US");
  });

  it("formats amounts beyond float precision exactly", () => {
    expect(formatMoney(money(9_007_199_254_740_993n, "USD"), "en-US")).toBe("$90,071,992,547,409.93");
  });
});
