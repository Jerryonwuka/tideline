// §10.4 idle-vessel pricing and buyer ranking: pure rules, no LLM. The inputs are kept with each
// suggestion and shown to the owner.

import { IDLE_DEFAULTS, SIZE_BANDS } from "@/config/idle";

export function median(values: bigint[]): bigint | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2n;
}

export function sizeBand(lengthM: number | null): number | null {
  if (lengthM === null || !Number.isFinite(lengthM)) return null;
  let band = 0;
  SIZE_BANDS.forEach((min, i) => {
    if (lengthM >= min) band = i;
  });
  return band;
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !["and", "the", "area", "port", "near"].includes(w)),
  );

/** Two operating areas share a meaningful word ("Bonny and Onne" ~ "Onne terminal"). */
export function areaMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const wa = words(a);
  return [...words(b)].some((w) => wa.has(w));
}

export interface PriceInputs {
  currency: string;
  /** This vessel's last charters (day rates, same currency). */
  vesselRates: bigint[];
  /** The org's other vessels of the same type, used when this vessel has no charters. */
  orgSameTypeRates: bigint[];
  /** Live board listings of the same type, size band and area, last 90 days. */
  boardRates: bigint[];
  idleDays: number;
  minRateMinor: bigint | null;
}

export interface PriceSuggestion {
  rateMinor: bigint | null;
  inputs: {
    currency: string;
    baseline_source: "vessel" | "org_same_type" | "board" | "none";
    baseline_minor: string | null;
    vessel_charters: number;
    org_same_type_charters: number;
    board_listings: number;
    board_median_minor: string | null;
    board_weight_bps: number;
    weeks_idle: number;
    weekly_step_bps: number;
    reduction_bps: number;
    min_rate_minor: string | null;
    floored: boolean;
  };
}

const roundTo = (v: bigint, step: bigint) => ((v + step / 2n) / step) * step;

export function suggestPrice(p: PriceInputs, cfg = IDLE_DEFAULTS): PriceSuggestion {
  const own = median(p.vesselRates.slice(0, cfg.lastCharters));
  const org = median(p.orgSameTypeRates);
  const board = median(p.boardRates);
  const [source, baseline] =
    own !== null
      ? (["vessel", own] as const)
      : org !== null
        ? (["org_same_type", org] as const)
        : board !== null
          ? (["board", board] as const)
          : (["none", null] as const);
  const weeks = Math.floor(Math.max(0, p.idleDays) / 7);
  const reduction = Math.min(weeks * cfg.weeklyStepBps, cfg.maxReductionBps);
  let rate: bigint | null = null;
  let floored = false;
  if (baseline !== null) {
    const toward =
      board !== null && source !== "board" ? ((board - baseline) * BigInt(cfg.boardWeightBps)) / 10_000n : 0n;
    rate = baseline + toward;
    rate = (rate * BigInt(10_000 - reduction)) / 10_000n;
    rate = roundTo(rate, cfg.roundToMinor);
  }
  if (p.minRateMinor !== null && (rate === null || rate < p.minRateMinor)) {
    floored = rate !== null;
    rate = rate === null ? null : p.minRateMinor;
  }
  return {
    rateMinor: rate,
    inputs: {
      currency: p.currency,
      baseline_source: source,
      baseline_minor: baseline?.toString() ?? null,
      vessel_charters: Math.min(p.vesselRates.length, cfg.lastCharters),
      org_same_type_charters: p.orgSameTypeRates.length,
      board_listings: p.boardRates.length,
      board_median_minor: board?.toString() ?? null,
      board_weight_bps: cfg.boardWeightBps,
      weeks_idle: weeks,
      weekly_step_bps: cfg.weeklyStepBps,
      reduction_bps: reduction,
      min_rate_minor: p.minRateMinor?.toString() ?? null,
      floored,
    },
  };
}

export interface BuyerSignals {
  orgId: string;
  name: string;
  /** Charters this charterer has had with this owner. */
  pastCharters: number;
  /** Requests for a similar vessel type in the last 90 days (to anyone, including open requests). */
  similarRequests: number;
  /** Board searches for this vessel type in the last 90 days. */
  similarSearches: number;
  /** Any of their requests or searches mention the vessel's area. */
  areaMatch: boolean;
}

export type BuyerReason = "past_client" | "similar_requests" | "similar_searches" | "area";

/** Past clients always rank above everyone else; then demand for the type, then area. */
export function rankBuyers(signals: BuyerSignals[], limit = 10) {
  return signals
    .map((s) => {
      const reasons: BuyerReason[] = [];
      let score = 0;
      if (s.pastCharters > 0) {
        score += 1000 + 50 * Math.min(s.pastCharters, 10);
        reasons.push("past_client");
      }
      if (s.similarRequests > 0) {
        score += 30 * Math.min(s.similarRequests, 10);
        reasons.push("similar_requests");
      }
      if (s.similarSearches > 0) {
        score += 5 * Math.min(s.similarSearches, 20);
        reasons.push("similar_searches");
      }
      if (s.areaMatch) {
        score += 40;
        reasons.push("area");
      }
      return { org_id: s.orgId, name: s.name, score, reasons };
    })
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
