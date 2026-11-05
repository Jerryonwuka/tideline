import { describe, expect, it } from "vitest";
import { hireDays, invoiceStatus, invoiceTotals, lineAmount } from "@/lib/invoices";

const view = (t: ReturnType<typeof invoiceTotals>) =>
  Object.fromEntries((["subtotal", "discount", "taxable", "tax", "total"] as const).map((k) => [k, t[k].amountMinor]));

describe("invoice totals", () => {
  it("charter: days × day rate + mobilisation − discount, VAT 7.5% (NGN)", () => {
    const t = invoiceTotals(
      [
        { description: "Hire, 5 days", quantity: 5, unitMinor: 140000000n, kind: "charge" },
        { description: "Mobilisation", quantity: 1, unitMinor: 50000000n, kind: "charge" },
        { description: "Loyalty discount", quantity: 1, unitMinor: 25000000n, kind: "discount" },
      ],
      "NGN",
      750,
    );
    // 700,000,000 + 50,000,000 − 25,000,000 = 725,000,000; VAT 7.5% = 54,375,000
    expect(view(t)).toEqual({
      subtotal: 750000000n,
      discount: 25000000n,
      taxable: 725000000n,
      tax: 54375000n,
      total: 779375000n,
    });
  });

  it("no VAT when the org isn't VAT-registered", () => {
    const t = invoiceTotals([{ description: "Hire", quantity: 2, unitMinor: 10000n, kind: "charge" }], "USD", null);
    expect(view(t)).toEqual({ subtotal: 20000n, discount: 0n, taxable: 20000n, tax: 0n, total: 20000n });
  });

  it("rounds VAT half to even at the minor unit (USD)", () => {
    // 7.5% of 10¢ = 0.75¢ → 1¢; of 6¢ = 0.45¢ → 0¢; exact halves go to even: 10% of 5¢ → 0¢, of 15¢ → 2¢
    expect(
      invoiceTotals([{ description: "x", quantity: 1, unitMinor: 10n, kind: "charge" }], "USD", 750).tax.amountMinor,
    ).toBe(1n);
    expect(
      invoiceTotals([{ description: "x", quantity: 1, unitMinor: 6n, kind: "charge" }], "USD", 750).tax.amountMinor,
    ).toBe(0n);
    expect(
      invoiceTotals([{ description: "x", quantity: 1, unitMinor: 5n, kind: "charge" }], "USD", 1000).tax.amountMinor,
    ).toBe(0n);
    expect(
      invoiceTotals([{ description: "x", quantity: 1, unitMinor: 15n, kind: "charge" }], "USD", 1000).tax.amountMinor,
    ).toBe(2n);
  });

  it("supports part quantities (4.5 days) without floats in money", () => {
    expect(lineAmount(4.5, 100001n)).toBe(450004n); // 450004.5 → half to even → 450004
    expect(lineAmount(1.25, 400n)).toBe(500n);
  });

  it("refuses discounts larger than the charges and negative quantities", () => {
    expect(() =>
      invoiceTotals([{ description: "d", quantity: 1, unitMinor: 5n, kind: "discount" }], "NGN", null),
    ).toThrow();
    expect(() => lineAmount(-1, 5n)).toThrow();
  });
});

describe("hire days and status", () => {
  it("counts booked days inclusively, or on/off-hire time rounded up", () => {
    expect(hireDays({ start_date: "2026-12-01", end_date: "2026-12-05" })).toBe(5);
    expect(
      hireDays({
        start_date: "2026-12-01",
        end_date: "2026-12-05",
        on_hire_at: "2026-12-01T08:00:00Z",
        off_hire_at: "2026-12-04T09:00:00Z",
      }),
    ).toBe(4);
  });

  it.each([
    ["sent", 1000n, 0n, "2026-12-10", "sent"],
    ["sent", 1000n, 400n, "2026-12-10", "part_paid"],
    ["part_paid", 1000n, 1000n, "2026-12-10", "paid"],
    ["sent", 1000n, 0n, "2026-11-01", "overdue"],
    ["overdue", 1000n, 1000n, "2026-11-01", "paid"],
    ["draft", 1000n, 0n, "2026-11-01", "draft"],
    ["void", 1000n, 0n, "2026-11-01", "void"],
  ] as const)("%s, paid %s of %s → %s", (current, total, paid, due, expected) => {
    expect(invoiceStatus(current, total, paid, due, "2026-11-20")).toBe(expected);
  });
});

describe("contract templates", () => {
  it("fills variables and shows missing ones as [not set]", async () => {
    const { renderTemplate, templateVariables } = await import("@/lib/contracts");
    const body = "Between {{owner_name}} and {{ charterer_name }}. Fuel: {{fuel_terms}}.";
    expect(templateVariables(body)).toEqual(["owner_name", "charterer_name", "fuel_terms"]);
    expect(renderTemplate(body, { owner_name: "Delta Marine", charterer_name: "Gulf Energy", fuel_terms: "" })).toBe(
      "Between Delta Marine and Gulf Energy. Fuel: [not set].",
    );
  });
});
