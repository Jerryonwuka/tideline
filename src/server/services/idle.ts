import "server-only";
import { IDLE_DEFAULTS } from "@/config/idle";
import type { Json } from "@/lib/database.types";
import { areaMatch, rankBuyers, sizeBand, suggestPrice, type BuyerSignals } from "@/lib/idle";
import { formatMoney, money } from "@/lib/money";
import { guardDraft } from "@/lib/tenders";
import {
  IDLE_LISTING_PROMPT_ID,
  IDLE_LISTING_PROMPT_VERSION,
  IDLE_LISTING_SYSTEM,
  IDLE_OUTREACH_PROMPT_ID,
  IDLE_OUTREACH_PROMPT_VERSION,
  idleListingMessage,
  idleListingSchema,
  idleOutreachPrompt,
  type IdleListing,
} from "@/server/ai/prompts/idle";
import { integrations } from "@/server/integrations";
import { supabaseAdmin, type AdminDb } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

// §10.4: the idle-vessels job marks charter vessels with no work, and for those idle N days or more
// (org `settings.idle_days`, default 3) saves a rule-based day rate with its inputs, an LLM rationale
// and listing description (needs review), and charterers ranked without an LLM. The owner publishes
// to the board with one tap and can have an outreach message drafted to send themselves.

const DAY = 86_400_000;
const WORKING = ["pending_payment", "active"] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);

type VesselRow = {
  id: string;
  org_id: string;
  name: string;
  type: string;
  status: string;
  length_m: number | null;
  year_built: number | null;
  passenger_capacity: number | null;
  cargo_capacity_t: number | null;
  idle_since: string | null;
  created_at: string;
  org: { name: string; currency: string; settings: Json | null } | null;
};

export async function runIdleVessels(now = new Date(), only?: { orgId: string }) {
  const admin = supabaseAdmin();
  const summary = { idle: 0, busy: 0, suggestions: 0 };
  await admin
    .from("board_searches")
    .delete()
    .lt("created_at", new Date(now.getTime() - IDLE_DEFAULTS.boardWindowDays * DAY).toISOString());

  const { data: vessels, error } = await admin
    .from("vessels")
    .select(
      "id, org_id, name, type, status, length_m, year_built, passenger_capacity, cargo_capacity_t, idle_since, created_at, org:orgs(name, currency, settings)",
    )
    .eq("charter_enabled", true)
    .in("status", ["active", "idle"])
    .match(only ? { org_id: only.orgId } : {});
  if (error) throw fromDbError(error);

  for (const v of (vessels ?? []) as unknown as VesselRow[]) {
    const work = await lastWork(admin, v.id, now);
    if (work.busy) {
      summary.busy++;
      if (v.idle_since || v.status === "idle") {
        await admin.from("vessels").update({ idle_since: null, status: "active" }).eq("id", v.id);
        await admin.from("vessel_suggestions").delete().eq("vessel_id", v.id).is("published_listing_id", null);
      }
      continue;
    }
    summary.idle++;
    const idleSince = v.idle_since ?? work.lastEnd ?? now.toISOString();
    if (!v.idle_since || v.status !== "idle") {
      await admin.from("vessels").update({ idle_since: idleSince, status: "idle" }).eq("id", v.id);
    }
    const idleDays = Math.floor((now.getTime() - new Date(idleSince).getTime()) / DAY);
    const threshold = Number((v.org?.settings as { idle_days?: number } | null)?.idle_days) || IDLE_DEFAULTS.idleDays;
    if (idleDays < threshold) continue;
    await refreshSuggestion(admin, { ...v, idle_since: idleSince }, idleDays, now);
    summary.suggestions++;
  }
  return summary;
}

/** A vessel is working when a charter covers today or it ran a trip in the last day. */
async function lastWork(admin: AdminDb, vesselId: string, now: Date) {
  const today = iso(now);
  const [{ data: charters }, { data: trips }] = await Promise.all([
    admin
      .from("charters")
      .select("start_date, end_date, status")
      .eq("vessel_id", vesselId)
      .neq("status", "cancelled")
      .order("end_date", { ascending: false })
      .limit(20),
    admin
      .from("trips")
      .select("created_at")
      .eq("vessel_id", vesselId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const busy =
    (charters ?? []).some(
      (c) => (WORKING as readonly string[]).includes(c.status) && c.start_date <= today && c.end_date >= today,
    ) ||
    (!!trips?.[0] && now.getTime() - new Date(trips[0].created_at).getTime() < DAY);
  const ends = [
    ...(charters ?? []).filter((c) => c.end_date < today).map((c) => `${c.end_date}T23:59:59Z`),
    ...(trips ?? []).map((t) => t.created_at),
  ].sort();
  return { busy, lastEnd: ends.at(-1) ?? null };
}

async function refreshSuggestion(admin: AdminDb, v: VesselRow, idleDays: number, now: Date) {
  const { data: listing } = await admin
    .from("charter_listings")
    .select("id, currency, min_rate_minor, operating_area")
    .eq("vessel_id", v.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currency = listing?.currency ?? v.org?.currency;
  if (!currency) return;
  const area = listing?.operating_area ?? null;
  const since = new Date(now.getTime() - IDLE_DEFAULTS.boardWindowDays * DAY).toISOString();

  const [{ data: own }, { data: orgCharters }, { data: board }] = await Promise.all([
    admin
      .from("charters")
      .select("day_rate_minor")
      .eq("vessel_id", v.id)
      .eq("currency", currency)
      .in("status", ["active", "completed"])
      .order("start_date", { ascending: false })
      .limit(IDLE_DEFAULTS.lastCharters),
    admin
      .from("charters")
      .select("day_rate_minor, vessel:vessels!inner(type)")
      .eq("owner_org_id", v.org_id)
      .neq("vessel_id", v.id)
      .eq("currency", currency)
      .eq("vessel.type", v.type)
      .in("status", ["active", "completed"])
      .order("start_date", { ascending: false })
      .limit(20),
    admin
      .from("charter_listings")
      .select("day_rate_minor, operating_area, vessel:vessels!inner(type, length_m)")
      .eq("status", "live")
      .eq("currency", currency)
      .eq("vessel.type", v.type)
      .neq("vessel_id", v.id)
      .gte("created_at", since)
      .limit(200),
  ]);
  const band = sizeBand(v.length_m === null ? null : Number(v.length_m));
  const boardRates = (board ?? [])
    .filter((l) => {
      const vessel = l.vessel as unknown as { length_m: number | null } | null;
      return (
        sizeBand(vessel?.length_m == null ? null : Number(vessel.length_m)) === band &&
        (!area || areaMatch(area, l.operating_area))
      );
    })
    .map((l) => BigInt(l.day_rate_minor));
  const price = suggestPrice({
    currency,
    vesselRates: (own ?? []).map((c) => BigInt(c.day_rate_minor)),
    orgSameTypeRates: (orgCharters ?? []).map((c) => BigInt(c.day_rate_minor)),
    boardRates,
    idleDays,
    minRateMinor: listing?.min_rate_minor ? BigInt(listing.min_rate_minor) : null,
  });
  const buyers = await buyerSignals(admin, v, area, now);

  const { data: prior } = await admin
    .from("vessel_suggestions")
    .select("id, suggested_rate_minor, rationale, listing_description, review_status")
    .eq("vessel_id", v.id)
    .maybeSingle();
  const rate = price.rateMinor?.toString() ?? null;
  // The AI text is written again only when the price changed (or there's none yet).
  let text: IdleListing | null =
    prior &&
    (prior.suggested_rate_minor === null ? null : String(prior.suggested_rate_minor)) === rate &&
    prior.rationale
      ? { rationale: prior.rationale, description: prior.listing_description ?? "" }
      : null;
  if (!text) text = await writeListingText(v, area, currency, price);
  const row = {
    org_id: v.org_id,
    vessel_id: v.id,
    idle_since: v.idle_since!,
    currency,
    suggested_rate_minor: rate,
    inputs: { ...price.inputs, idle_days: idleDays, area } as unknown as Json,
    rationale: text?.rationale ?? null,
    listing_description: text?.description ?? null,
    review_status: "needs_review" as const,
    buyers: rankBuyers(buyers) as unknown as Json,
  };
  const { error } = prior
    ? await admin
        .from("vessel_suggestions")
        .update(row as never)
        .eq("id", prior.id)
    : await admin.from("vessel_suggestions").insert(row as never);
  if (error) throw fromDbError(error);
}

async function writeListingText(
  v: VesselRow,
  area: string | null,
  currency: string,
  price: ReturnType<typeof suggestPrice>,
): Promise<IdleListing | null> {
  const vessel = {
    name: v.name,
    type: v.type,
    length_m: v.length_m,
    year_built: v.year_built,
    passenger_capacity: v.passenger_capacity,
    cargo_capacity_t: v.cargo_capacity_t,
    area,
  };
  const pricing = {
    rate: price.rateMinor === null ? null : formatMoney(money(price.rateMinor, currency), "en"),
    inputs: price.inputs,
  };
  const started = Date.now();
  try {
    const out = await integrations().llm.generateStructured({
      promptId: IDLE_LISTING_PROMPT_ID,
      promptVersion: IDLE_LISTING_PROMPT_VERSION,
      system: IDLE_LISTING_SYSTEM,
      messages: [{ role: "user", content: idleListingMessage(vessel, pricing) }],
      schema: idleListingSchema,
      schemaName: "idle_listing",
    });
    const parsed = idleListingSchema.parse(out.raw);
    const sources = [JSON.stringify(vessel), JSON.stringify(pricing)];
    await logJob(v.org_id, v.id, true, out.usage, started);
    // Figures the model added that aren't in the profile or numbers are marked for the owner.
    return {
      rationale: guardDraft(parsed.rationale, ...sources).text,
      description: guardDraft(parsed.description, ...sources).text,
    };
  } catch (err) {
    await logJob(v.org_id, v.id, false, { model: null, tokensIn: 0, tokensOut: 0 }, started, err);
    return null;
  }
}

async function logJob(
  orgId: string,
  vesselId: string,
  ok: boolean,
  usage: { model: string | null; tokensIn: number; tokensOut: number },
  started: number,
  err?: unknown,
  version: string = IDLE_LISTING_PROMPT_VERSION,
) {
  await supabaseAdmin()
    .from("ai_jobs")
    .insert({
      org_id: orgId,
      kind: "price_rationale",
      input_ref: `vessel:${vesselId}`,
      prompt_version: version,
      model: usage.model,
      tokens_in: usage.tokensIn,
      tokens_out: usage.tokensOut,
      latency_ms: Date.now() - started,
      status: ok ? "done" : "failed",
      error: err ? (err instanceof Error ? err.message : "error").slice(0, 300) : null,
    });
}

/** Signals for charterer orgs: past charters with this owner, similar requests and searches, area. */
async function buyerSignals(admin: AdminDb, v: VesselRow, area: string | null, now: Date): Promise<BuyerSignals[]> {
  const since = new Date(now.getTime() - IDLE_DEFAULTS.boardWindowDays * DAY).toISOString();
  const [{ data: past }, { data: requests }, { data: searches }] = await Promise.all([
    admin
      .from("charters")
      .select("charterer_org_id")
      .eq("owner_org_id", v.org_id)
      .not("charterer_org_id", "is", null)
      .neq("status", "cancelled"),
    admin
      .from("charter_requests")
      .select("charterer_org_id, vessel_type, location, listing:charter_listings(vessel:vessels(type))")
      .gte("created_at", since),
    admin.from("board_searches").select("charterer_org_id, vessel_type, area").gte("created_at", since),
  ]);
  const by = new Map<string, Omit<BuyerSignals, "name">>();
  const get = (id: string) => {
    let s = by.get(id);
    if (!s) by.set(id, (s = { orgId: id, pastCharters: 0, similarRequests: 0, similarSearches: 0, areaMatch: false }));
    return s;
  };
  for (const c of past ?? []) get(c.charterer_org_id!).pastCharters++;
  for (const r of requests ?? []) {
    const type = r.vessel_type ?? (r.listing as unknown as { vessel: { type: string } | null } | null)?.vessel?.type;
    if (type !== v.type) continue;
    const s = get(r.charterer_org_id);
    s.similarRequests++;
    if (areaMatch(area, r.location)) s.areaMatch = true;
  }
  for (const q of searches ?? []) {
    if (q.vessel_type !== v.type) continue;
    const s = get(q.charterer_org_id);
    s.similarSearches++;
    if (areaMatch(area, q.area)) s.areaMatch = true;
  }
  by.delete(v.org_id);
  if (!by.size) return [];
  const { data: orgs } = await admin
    .from("orgs")
    .select("id, name")
    .in("id", [...by.keys()]);
  const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  return [...by.values()].filter((s) => names.has(s.orgId)).map((s) => ({ ...s, name: names.get(s.orgId)! }));
}

/** Signed-in charterers' board searches feed buyer ranking (type and area only, kept 90 days). */
export async function logBoardSearch(chartererOrgIds: string[], filters: { type?: string; area?: string }) {
  if (!chartererOrgIds.length || (!filters.type && !filters.area)) return;
  const admin = supabaseAdmin();
  const { data } = await admin.from("orgs").select("id").in("id", chartererOrgIds).eq("type", "charterer");
  if (!data?.length) return;
  await admin.from("board_searches").insert(
    data.map((o) => ({
      charterer_org_id: o.id,
      vessel_type: filters.type ?? null,
      area: filters.area?.slice(0, 120) ?? null,
    })),
  );
}

// ----- Owner ---------------------------------------------------------------------------------------------

export async function listSuggestions(db: Db, orgId: string) {
  const { data, error } = await db
    .from("vessel_suggestions")
    .select("*, vessel:vessels(id, name, type, length_m)")
    .eq("org_id", orgId)
    .order("idle_since", { ascending: true });
  if (error) throw fromDbError(error);
  return data;
}

export async function suggestionFor(db: Db, vesselId: string) {
  const { data, error } = await db.from("vessel_suggestions").select("*").eq("vessel_id", vesselId).maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}

/** One tap: the suggested (or edited) rate and text go live on the board; never below the minimum. */
export async function publishSuggestion(
  db: Db,
  vesselId: string,
  input: { rateMinor?: bigint; area?: string; description?: string },
) {
  const s = await suggestionFor(db, vesselId);
  if (!s) throw new ServiceError("not_found");
  const rate = input.rateMinor ?? (s.suggested_rate_minor ? BigInt(s.suggested_rate_minor) : null);
  if (rate === null || rate <= 0n) throw new ServiceError("validation");
  const { data: listing } = await db
    .from("charter_listings")
    .select("id, min_rate_minor, operating_area")
    .eq("vessel_id", vesselId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (listing?.min_rate_minor && rate < BigInt(listing.min_rate_minor)) throw new ServiceError("rate_below_minimum");
  const area = input.area?.trim() || listing?.operating_area;
  if (!area) throw new ServiceError("validation");
  const fields = {
    day_rate_minor: rate.toString(),
    operating_area: area,
    description: input.description?.trim() || s.listing_description || null,
    status: "live" as const,
    suggested_rate_minor: s.suggested_rate_minor,
    suggestion_inputs: s.inputs,
  };
  const { data, error } = listing
    ? await db
        .from("charter_listings")
        .update(fields as never)
        .eq("id", listing.id)
        .select("id")
        .maybeSingle()
    : await db
        .from("charter_listings")
        .insert({ ...fields, org_id: s.org_id, vessel_id: vesselId, currency: s.currency } as never)
        .select("id")
        .single();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
  await supabaseAdmin()
    .from("vessel_suggestions")
    .update({ review_status: "accepted", published_listing_id: data.id })
    .eq("id", s.id);
  return data.id;
}

/** A drafted message for the owner to send themselves (nothing is sent). */
export async function draftOutreach(db: Db, vesselId: string, buyerOrgId: string, locale = "en") {
  const s = await suggestionFor(db, vesselId);
  if (!s) throw new ServiceError("not_found");
  const buyer = (s.buyers as { org_id: string; name: string }[]).find((b) => b.org_id === buyerOrgId);
  if (!buyer) throw new ServiceError("not_found");
  const [{ data: vessel }, { data: org }] = await Promise.all([
    db.from("vessels").select("name, type, length_m, year_built").eq("id", vesselId).single(),
    db.from("orgs").select("name").eq("id", s.org_id).single(),
  ]);
  const area = (s.inputs as { area?: string | null }).area ?? null;
  const facts = { ...vessel, area };
  const rate = s.suggested_rate_minor ? formatMoney(money(BigInt(s.suggested_rate_minor), s.currency), locale) : null;
  const started = Date.now();
  const out = await integrations().llm.generateText({
    promptId: IDLE_OUTREACH_PROMPT_ID,
    promptVersion: IDLE_OUTREACH_PROMPT_VERSION,
    system: "You draft short business messages for vessel owners.",
    messages: [{ role: "user", content: idleOutreachPrompt(org?.name ?? "", buyer.name, facts, rate) }],
  });
  await logJob(s.org_id, vesselId, true, out.usage, started, undefined, IDLE_OUTREACH_PROMPT_VERSION);
  return guardDraft(out.text.trim(), JSON.stringify(facts), rate ?? "", org?.name ?? "", buyer.name).text;
}
