import { divRoundHalfEven, money, percentBps, type Money } from "./money";

// Invoice totals (§4.3): charges − discounts, then VAT on the result if the org is VAT-registered.
// Integer minor units, one currency per invoice, VAT rounded half to even at the minor unit.

export interface InvoiceLine {
  description: string;
  /** Up to 3 decimal places (e.g. 4.5 days); stored as an integer of thousandths. */
  quantity: number;
  unitMinor: bigint;
  kind: "charge" | "discount";
}

export interface InvoiceTotals {
  lines: { description: string; quantity: number; unit: Money; amount: Money; kind: "charge" | "discount" }[];
  subtotal: Money;
  discount: Money;
  taxable: Money;
  tax: Money;
  total: Money;
}

export function lineAmount(quantity: number, unitMinor: bigint): bigint {
  if (!Number.isFinite(quantity) || quantity < 0) throw new RangeError("quantity must be a non-negative number");
  const thousandths = BigInt(Math.round(quantity * 1000));
  return divRoundHalfEven(thousandths * unitMinor, 1000n);
}

export function invoiceTotals(lines: InvoiceLine[], currency: string, vatBps: number | null): InvoiceTotals {
  const shaped = lines.map((l) => {
    const amount = lineAmount(l.quantity, l.unitMinor);
    return {
      description: l.description,
      quantity: l.quantity,
      unit: money(l.unitMinor, currency),
      amount: money(amount, currency),
      kind: l.kind,
    };
  });
  const sum = (kind: "charge" | "discount") =>
    shaped.filter((l) => l.kind === kind).reduce((s, l) => s + l.amount.amountMinor, 0n);
  const charges = sum("charge");
  const discounts = sum("discount");
  if (discounts > charges) throw new RangeError("discounts exceed charges");
  const taxable = money(charges - discounts, currency);
  const tax = vatBps ? percentBps(taxable, vatBps) : money(0, currency);
  return {
    lines: shaped,
    subtotal: money(charges, currency),
    discount: money(discounts, currency),
    taxable,
    tax,
    total: money(taxable.amountMinor + tax.amountMinor, currency),
  };
}

/** Days on hire: from on-hire to off-hire (part days count as whole days), else the booked dates. */
export function hireDays(c: {
  start_date: string;
  end_date: string;
  on_hire_at?: string | null;
  off_hire_at?: string | null;
}): number {
  if (c.on_hire_at && c.off_hire_at) {
    return Math.max(1, Math.ceil((Date.parse(c.off_hire_at) - Date.parse(c.on_hire_at)) / 86_400_000));
  }
  return Math.round((Date.parse(`${c.end_date}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Invoice status from what has been paid and when it is due. */
export function invoiceStatus(
  current: "draft" | "sent" | "part_paid" | "paid" | "overdue" | "void",
  totalMinor: bigint,
  paidMinor: bigint,
  dueDate: string | null,
  today: string,
): typeof current {
  if (current === "draft" || current === "void") return current;
  if (paidMinor >= totalMinor) return "paid";
  if (dueDate && dueDate < today) return "overdue";
  return paidMinor > 0n ? "part_paid" : "sent";
}
