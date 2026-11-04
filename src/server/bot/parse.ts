// Deterministic parsing for the bot: number words, place names with aliases, and the SMS format
// (BUILD_SPEC §8 "TRIP 4 CMS IKD 18 27000"). The same rules power the local stand-in for the AI
// extractor, so dev and tests behave plausibly without a vendor. Real extraction uses the LLM.

export interface BotContext {
  vessels: { id: string; name: string }[];
  routes: { id: string; origin: string; destination: string; originAliases: string[]; destinationAliases: string[] }[];
  openTrips: { id: string; label: string }[];
  currency: string;
}

export type DraftKind = "trip_log" | "expense" | "fuel" | "incident" | "other";

/** §10.2 extraction schema (amounts in major units of the org's currency). */
export interface BotDraft {
  kind: DraftKind;
  vessel_id: string | null;
  route_id: string | null;
  origin: string | null;
  destination: string | null;
  passenger_count: number | null;
  amount: number | null;
  currency: string | null;
  payment_method: string | null;
  expense_category: string | null;
  urgent: boolean;
  summary_for_confirmation: string;
}

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, k: 1000, million: 1_000_000, m: 1_000_000 };

/**
 * Rewrites number words and shorthand as digits: "twenty-seven thousand" → "27000",
 * "eighteen" → "18", "27k" → "27000", "1.5m" → "1500000", "27,000" → "27000".
 */
export function digitise(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/(\d+(?:\.\d+)?)\s*(k|m)\b/g, (_, n: string, s: string) => String(Math.round(Number(n) * SCALES[s]!)))
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  let total = 0;
  let current = 0;
  let inNumber = false;
  const flush = () => {
    if (inNumber) out.push(String(total + current));
    total = 0;
    current = 0;
    inNumber = false;
  };
  for (const raw of tokens) {
    const word = raw.replace(/[^a-z0-9]/g, "");
    const trailing = raw.match(/[^a-z0-9]+$/)?.[0] ?? "";
    if (word in UNITS) {
      current += UNITS[word]!;
      inNumber = true;
    } else if (word in TENS) {
      current += TENS[word]!;
      inNumber = true;
    } else if (inNumber && word === "hundred") {
      current *= 100;
    } else if (inNumber && (word === "thousand" || word === "k" || word === "million")) {
      total += current * SCALES[word]!;
      current = 0;
    } else if (inNumber && word === "and") {
      continue;
    } else {
      flush();
      out.push(raw);
      continue;
    }
    if (trailing) {
      flush();
      out[out.length - 1] += trailing;
    }
  }
  flush();
  return out.join(" ");
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Places mentioned in the text, in order of appearance (names and aliases, case-insensitive). */
export function placesIn(text: string, ctx: BotContext): string[] {
  const t = ` ${norm(text)} `;
  const names = new Map<string, string>();
  for (const r of ctx.routes) {
    for (const n of [r.origin, ...r.originAliases]) names.set(norm(n), r.origin);
    for (const n of [r.destination, ...r.destinationAliases]) names.set(norm(n), r.destination);
  }
  const found: { at: number; name: string }[] = [];
  for (const [alias, name] of names) {
    if (!alias) continue;
    const at = t.indexOf(` ${alias} `);
    if (at >= 0 && !found.some((f) => f.name === name)) found.push({ at, name });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.name);
}

export function routeFor(ctx: BotContext, origin: string | null, destination: string | null) {
  return ctx.routes.find((r) => r.origin === origin && r.destination === destination) ?? null;
}

function vesselIn(text: string, ctx: BotContext): string | null {
  const t = norm(text);
  const named = ctx.vessels.find((v) => t.includes(norm(v.name)));
  if (named) return named.id;
  return ctx.vessels.length === 1 ? ctx.vessels[0]!.id : null;
}

const URGENT =
  /\b(capsiz\w*|sink\w*|sank|fire|burn\w*|injur\w*|hurt|drown\w*|missing|overboard|emergency|mayday|help us|accident|collision|crash\w*)\b/;
const FUEL = /\b(fuel|diesel|petrol|gas oil|pms|ago)\b/;
const EXPENSE = /\b(repair\w*|maintenance|spare|wages?|salary|levy|levies|toll|paid|spent|bought)\b/;
const PAX = /(\d+)\s*(passengers?|people|persons?|pax|heads?)/;

/** Rule-based reading of a captain's message (local stand-in for the AI; same output schema). */
export function heuristicDraft(message: string, ctx: BotContext): BotDraft {
  const text = digitise(message);
  const lower = text.toLowerCase();
  const numbers = [...lower.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((m) => Number(m[0]));
  const base: BotDraft = {
    kind: "other",
    vessel_id: vesselIn(text, ctx),
    route_id: null,
    origin: null,
    destination: null,
    passenger_count: null,
    amount: null,
    currency: null,
    payment_method: /\btransfer\b/.test(lower) ? "transfer" : /\bcash\b/.test(lower) ? "cash" : null,
    expense_category: null,
    urgent: false,
    summary_for_confirmation: message.trim(),
  };
  if (URGENT.test(lower)) return { ...base, kind: "incident", urgent: true };

  const big = numbers.filter((n) => n >= 500);
  const amount = big.length ? big[big.length - 1]! : null;
  if (FUEL.test(lower))
    return { ...base, kind: "fuel", expense_category: "fuel", amount, currency: amount ? ctx.currency : null };
  if (EXPENSE.test(lower) && !PAX.test(lower)) {
    const category = /\b(wages?|salary)\b/.test(lower)
      ? "wages"
      : /\b(levy|levies|toll)\b/.test(lower)
        ? "levy"
        : /\b(repair|maintenance|spare)/.test(lower)
          ? "maintenance"
          : "other";
    return { ...base, kind: "expense", expense_category: category, amount, currency: amount ? ctx.currency : null };
  }

  const places = placesIn(text, ctx);
  const pax = lower.match(PAX)?.[1];
  if (/\btrip\b/.test(lower) || pax || places.length >= 2) {
    const [origin = null, destination = null] = places;
    const route = routeFor(ctx, origin, destination);
    return {
      ...base,
      kind: "trip_log",
      origin,
      destination,
      route_id: route?.id ?? null,
      passenger_count: pax ? Number(pax) : null,
      amount,
      currency: amount ? ctx.currency : null,
    };
  }
  return base;
}

/**
 * SMS fallback format: TRIP <n> <FROM> <TO> <PASSENGERS> <AMOUNT>, e.g. "TRIP 4 CMS IKD 18 27000"
 * (place names or their aliases). Null when the text isn't in that format.
 */
export function parseTripSms(message: string, ctx: BotContext): BotDraft | null {
  const m = digitise(message)
    .trim()
    .match(/^trip\s+(\d+)\s+(.+?)\s+(.+?)\s+(\d+)(?:\s+(\d+))?$/i);
  if (!m) return null;
  const [, , from, to, pax, amount] = m;
  const origin = placesIn(from!, ctx)[0] ?? null;
  const destination = placesIn(to!, ctx)[0] ?? null;
  if (!origin || !destination) return null;
  const route = routeFor(ctx, origin, destination);
  return {
    kind: "trip_log",
    vessel_id: ctx.vessels.length === 1 ? ctx.vessels[0]!.id : null,
    route_id: route?.id ?? null,
    origin,
    destination,
    passenger_count: Number(pax),
    amount: amount ? Number(amount) : null,
    currency: amount ? ctx.currency : null,
    payment_method: null,
    expense_category: null,
    urgent: false,
    summary_for_confirmation: message.trim(),
  };
}

/** The fields a draft must have before it can be confirmed, in the order the bot asks for them. */
export function missingFields(d: BotDraft): ("vessel_id" | "route" | "passenger_count" | "amount")[] {
  const missing: ("vessel_id" | "route" | "passenger_count" | "amount")[] = [];
  if (d.kind === "trip_log") {
    if (!d.vessel_id) missing.push("vessel_id");
    if (!d.route_id && !(d.origin && d.destination)) missing.push("route");
    if (d.passenger_count == null) missing.push("passenger_count");
  } else if (d.kind === "expense" || d.kind === "fuel") {
    if (d.amount == null) missing.push("amount");
    if (!d.vessel_id) missing.push("vessel_id");
  }
  return missing;
}

/** Fills the field the bot asked about from the person's short answer. */
export function applyAnswer(d: BotDraft, field: string, answer: string, ctx: BotContext): BotDraft {
  const text = digitise(answer);
  const n = text.match(/\d+(?:\.\d+)?/)?.[0];
  switch (field) {
    case "vessel_id": {
      const t = norm(answer);
      const v = ctx.vessels.find((x) => t.includes(norm(x.name)) || norm(x.name).includes(t));
      const byNumber = n ? ctx.vessels[Number(n) - 1] : undefined;
      return { ...d, vessel_id: v?.id ?? byNumber?.id ?? d.vessel_id };
    }
    case "route": {
      const [origin = null, destination = null] = placesIn(text, ctx);
      const byNumber = n ? ctx.routes[Number(n) - 1] : undefined;
      if (byNumber && !origin)
        return { ...d, route_id: byNumber.id, origin: byNumber.origin, destination: byNumber.destination };
      return { ...d, origin, destination, route_id: routeFor(ctx, origin, destination)?.id ?? null };
    }
    case "passenger_count":
      return { ...d, passenger_count: n ? Math.round(Number(n)) : d.passenger_count };
    case "amount":
      return { ...d, amount: n ? Number(n) : d.amount, currency: n ? ctx.currency : d.currency };
    default:
      return d;
  }
}
