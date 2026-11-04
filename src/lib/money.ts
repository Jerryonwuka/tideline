/**
 * Money is an integer amount of minor units (kobo, cents, ...) plus its ISO 4217 currency.
 * No floats anywhere. Amounts of different currencies are never combined.
 */
export interface Money {
  readonly amountMinor: bigint;
  readonly currency: string;
}

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot combine ${a} and ${b}`);
    this.name = "CurrencyMismatchError";
  }
}

const CURRENCY_RE = /^[A-Z]{3}$/;
const digitsCache = new Map<string, number>();

/**
 * Minor-unit digits for a currency. The `currencies` table is the source of truth at runtime;
 * this falls back to the ISO 4217 data built into Intl so pure functions work without a DB.
 */
export function minorUnitDigits(currency: string): number {
  assertCurrency(currency);
  let digits = digitsCache.get(currency);
  if (digits === undefined) {
    digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    digitsCache.set(currency, digits);
  }
  return digits;
}

export function assertCurrency(currency: string): void {
  if (!CURRENCY_RE.test(currency)) throw new RangeError(`Invalid ISO 4217 currency code: ${currency}`);
  // Throws RangeError for codes Intl does not know.
  new Intl.NumberFormat("en", { style: "currency", currency });
}

export function money(amountMinor: bigint | number, currency: string): Money {
  assertCurrency(currency);
  if (typeof amountMinor === "number" && !Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Minor-unit amount must be a safe integer, got ${amountMinor}`);
  }
  return Object.freeze({ amountMinor: BigInt(amountMinor), currency });
}

export function zero(currency: string): Money {
  return money(0n, currency);
}

/**
 * Parses a major-unit decimal string ("27000", "27,000.50", "-3.5") to Money without floats.
 * Rejects more decimal places than the currency allows.
 */
export function fromMajor(major: string, currency: string): Money {
  const digits = minorUnitDigits(currency);
  const cleaned = major.trim().replace(/,/g, "");
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) throw new RangeError(`Not a decimal amount: "${major}"`);
  const [, sign, whole = "0", frac = ""] = match;
  if (frac.length > digits) {
    throw new RangeError(`${currency} allows ${digits} decimal places, got "${major}"`);
  }
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt(frac.padEnd(digits, "0") || "0");
  return money(sign ? -minor : minor, currency);
}

/** Major-unit decimal string, e.g. 2700050n NGN → "27000.50". For forms and CSV, not display. */
export function toMajorString(m: Money): string {
  const digits = minorUnitDigits(m.currency);
  const negative = m.amountMinor < 0n;
  const abs = negative ? -m.amountMinor : m.amountMinor;
  if (digits === 0) return `${negative ? "-" : ""}${abs}`;
  const base = 10n ** BigInt(digits);
  const frac = (abs % base).toString().padStart(digits, "0");
  return `${negative ? "-" : ""}${abs / base}.${frac}`;
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

/** Multiply by a whole number (quantity, days on hire). */
export function multiply(m: Money, factor: number | bigint): Money {
  if (typeof factor === "number" && !Number.isSafeInteger(factor)) {
    throw new RangeError(`Factor must be an integer, got ${factor}`);
  }
  return money(m.amountMinor * BigInt(factor), m.currency);
}

/** Sum of a non-empty list in one currency. */
export function sum(items: readonly Money[], currency?: string): Money {
  const cur = currency ?? items[0]?.currency;
  if (!cur) throw new RangeError("sum() of an empty list needs a currency");
  return items.reduce((acc, m) => add(acc, m), zero(cur));
}

/** One total per currency, for dashboards that mix currencies. Never converts. */
export function totalsByCurrency(items: readonly Money[]): Money[] {
  const totals = new Map<string, bigint>();
  for (const m of items) totals.set(m.currency, (totals.get(m.currency) ?? 0n) + m.amountMinor);
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => money(v, c));
}

/** Integer division rounding half to even (banker's rounding). Divisor must be positive. */
export function divRoundHalfEven(numerator: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) throw new RangeError("divisor must be positive");
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  let q = n / divisor;
  const r = n % divisor;
  const twice = r * 2n;
  if (twice > divisor || (twice === divisor && q % 2n === 1n)) q += 1n;
  return negative ? -q : q;
}

/** Percentage fee in basis points (100 bps = 1%), rounded half to even at the minor unit. */
export function percentBps(m: Money, bps: number): Money {
  if (!Number.isInteger(bps) || bps < 0) throw new RangeError(`bps must be a non-negative integer, got ${bps}`);
  return money(divRoundHalfEven(m.amountMinor * BigInt(bps), 10_000n), m.currency);
}

export function isZero(m: Money): boolean {
  return m.amountMinor === 0n;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b);
  return a.amountMinor < b.amountMinor ? -1 : a.amountMinor > b.amountMinor ? 1 : 0;
}

/** Locale-aware display, e.g. formatMoney(money(10050n, "USD"), "en-US") → "$100.50". */
export function formatMoney(m: Money, locale: string, options: { hideZeroFraction?: boolean } = {}): string {
  const digits = minorUnitDigits(m.currency);
  const showFraction = !(options.hideZeroFraction && m.amountMinor % 10n ** BigInt(digits) === 0n);
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: showFraction ? digits : 0,
    maximumFractionDigits: showFraction ? digits : 0,
  });
  // Format the decimal string, not a float, so large amounts never lose precision.
  return fmt.format(toMajorString(m) as unknown as number);
}

/** JSON shape for APIs: amounts as strings because JSON numbers cannot hold every bigint. */
export function toJson(m: Money): { amount_minor: string; currency: string } {
  return { amount_minor: m.amountMinor.toString(), currency: m.currency };
}

export function fromJson(json: { amount_minor: string | number; currency: string }): Money {
  return money(BigInt(json.amount_minor), json.currency);
}
