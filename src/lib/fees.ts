import { add, multiply, percentBps, subtract, type Money } from "./money";

// §11 ticket fees. platform_fee = round(price × ticket_fee_bps / 10000), half to even at the minor
// unit. Passenger bears it: added to what they pay. Operator bears it: taken from the operator's
// share at settlement. Everything stays in the fare's currency.

export type FeeBearer = "passenger" | "operator";

export interface TicketPrice {
  /** Fare × seats. */
  subtotal: Money;
  platformFee: Money;
  /** What the buyer pays. */
  total: Money;
  /** What the operator receives. */
  operatorNet: Money;
}

export function ticketPrice(unitFare: Money, qty: number, feeBps: number, bearer: FeeBearer): TicketPrice {
  if (!Number.isInteger(qty) || qty < 1) throw new RangeError(`qty must be a positive integer, got ${qty}`);
  const subtotal = multiply(unitFare, qty);
  const platformFee = percentBps(subtotal, feeBps);
  return bearer === "passenger"
    ? { subtotal, platformFee, total: add(subtotal, platformFee), operatorNet: subtotal }
    : {
        subtotal,
        platformFee,
        total: subtotal,
        operatorNet: subtract(subtotal, platformFee),
      };
}

/** A subscription period's price: per-org plans bill once, per-vessel plans per charter vessel. */
export function subscriptionAmount(price: Money, unit: "per_org" | "per_vessel", vessels: number): Money {
  return unit === "per_org" ? price : multiply(price, Math.max(vessels, 1));
}
