// §10.4 defaults. Orgs can set `settings.idle_days`; the rest are platform-wide for now.
export const IDLE_DEFAULTS = {
  /** Days without work before a vessel gets a suggestion. */
  idleDays: 3,
  /** How many of the vessel's last charters form the baseline. */
  lastCharters: 5,
  /** How far the baseline moves toward the board median (basis points of the gap). */
  boardWeightBps: 5000,
  /** Reduction per full week idle, and the most it can take off in total. */
  weeklyStepBps: 500,
  maxReductionBps: 3000,
  /** Board listings considered: same type, size band and area, created in the last N days. */
  boardWindowDays: 90,
  /** Suggested rates are rounded to this many minor units (100 = one whole unit of currency). */
  roundToMinor: 100n,
} as const;

/** Length bands (metres) used to compare like with like on the board. */
export const SIZE_BANDS = [0, 20, 35, 60] as const;
