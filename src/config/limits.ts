// Abuse limits (§12): [max requests, window in seconds]. Per-IP limits are skipped with local
// fakes (every e2e run comes from one address); per-person limits always apply.
export const LIMITS = {
  otpPerPhone: [5, 15 * 60],
  otpPerIp: [30, 15 * 60],
  checkoutPerIp: [30, 10 * 60],
  charterRequestPerUser: [20, 60 * 60],
  dataRequestPerUser: [5, 24 * 60 * 60],
} as const satisfies Record<string, readonly [number, number]>;
export type LimitName = keyof typeof LIMITS;
