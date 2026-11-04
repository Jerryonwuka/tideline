import { percentBps, subtract, type Money } from "./money";

// §11 escrow release: the owner receives the released amount minus commission, where commission is
// the charter's commission_bps minus the in-app payment discount (never below zero), rounded half
// to even. Mirrors public.release_escrow in the database.

export function effectiveCommissionBps(commissionBps: number, inAppDiscountBps: number): number {
  return Math.max(commissionBps - inAppDiscountBps, 0);
}

export function releaseSplit(gross: Money, commissionBps: number, inAppDiscountBps: number) {
  const commission = percentBps(gross, effectiveCommissionBps(commissionBps, inAppDiscountBps));
  return { gross, commission, payout: subtract(gross, commission) };
}
