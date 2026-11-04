import { describe, expect, it } from "vitest";
import { subscriptionAmount, ticketPrice } from "@/lib/fees";
import { money } from "@/lib/money";

const view = (p: ReturnType<typeof ticketPrice>) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, `${v.amountMinor} ${v.currency}`]));

describe("ticket fees (integer minor units, one currency)", () => {
  it.each([
    // NGN ₦1,500 fare (150000 kobo), 2.5% fee
    [
      "NGN, passenger bears",
      money(150000, "NGN"),
      2,
      250,
      "passenger",
      { subtotal: "300000 NGN", platformFee: "7500 NGN", total: "307500 NGN", operatorNet: "300000 NGN" },
    ],
    [
      "NGN, operator bears",
      money(150000, "NGN"),
      2,
      250,
      "operator",
      { subtotal: "300000 NGN", platformFee: "7500 NGN", total: "300000 NGN", operatorNet: "292500 NGN" },
    ],
    // USD $3.45 fare, 2.5% of $3.45 = 8.625¢ → 9¢ (half to even rounds .625 up)
    [
      "USD, passenger bears",
      money(345, "USD"),
      1,
      250,
      "passenger",
      { subtotal: "345 USD", platformFee: "9 USD", total: "354 USD", operatorNet: "345 USD" },
    ],
    [
      "USD, operator bears",
      money(345, "USD"),
      1,
      250,
      "operator",
      { subtotal: "345 USD", platformFee: "9 USD", total: "345 USD", operatorNet: "336 USD" },
    ],
    // Exactly half a minor unit rounds to even: 2.5% of 20¢ = 0.5¢ → 0
    [
      "USD half to even",
      money(20, "USD"),
      1,
      250,
      "passenger",
      { subtotal: "20 USD", platformFee: "0 USD", total: "20 USD", operatorNet: "20 USD" },
    ],
    [
      "no fee",
      money(150000, "NGN"),
      3,
      0,
      "operator",
      { subtotal: "450000 NGN", platformFee: "0 NGN", total: "450000 NGN", operatorNet: "450000 NGN" },
    ],
  ] as const)("%s", (_, fare, qty, bps, bearer, expected) => {
    expect(view(ticketPrice(fare, qty, bps, bearer))).toEqual(expected);
  });

  it("never mixes currencies or floats", () => {
    const p = ticketPrice(money(150000, "NGN"), 1, 250, "passenger");
    for (const m of Object.values(p)) {
      expect(typeof m.amountMinor).toBe("bigint");
      expect(m.currency).toBe("NGN");
    }
    expect(() => ticketPrice(money(100, "NGN"), 0, 250, "passenger")).toThrow();
  });

  it("subscriptions: per org once, per vessel times charter vessels", () => {
    expect(subscriptionAmount(money(3000000, "NGN"), "per_org", 7).amountMinor).toBe(3000000n);
    expect(subscriptionAmount(money(15000000, "NGN"), "per_vessel", 3).amountMinor).toBe(45000000n);
    expect(subscriptionAmount(money(10000, "USD"), "per_vessel", 0).amountMinor).toBe(10000n);
  });
});

describe("escrow release split", () => {
  it("pays the owner gross minus commission (commission minus the in-app discount), half to even", async () => {
    const { releaseSplit, effectiveCommissionBps } = await import("@/lib/escrow");
    const { money } = await import("@/lib/money");
    expect(effectiveCommissionBps(500, 100)).toBe(400);
    expect(effectiveCommissionBps(100, 500)).toBe(0);
    const s = releaseSplit(money(50000000, "NGN"), 500, 100);
    expect([s.commission.amountMinor, s.payout.amountMinor]).toEqual([2000000n, 48000000n]);
    // 4% of $12.50 = 50¢ exactly (USD)
    const u = releaseSplit(money(1250, "USD"), 500, 100);
    expect([u.commission.amountMinor, u.payout.amountMinor]).toEqual([50n, 1200n]);
    const odd = releaseSplit(money(1262, "USD"), 500, 100); // 4% = 50.48¢ → 50¢; nothing is lost
    expect(odd.commission.amountMinor + odd.payout.amountMinor).toBe(1262n);
  });
});
