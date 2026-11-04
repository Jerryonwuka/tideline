import "server-only";
import { flagEnabled } from "@/server/features";
import { enforceLimit } from "@/server/rate-limit";
import { createTranslator } from "next-intl";
import { formatMoney, fromMajor, money } from "@/lib/money";
import type { ListingInput, QuoteInput, RequestInput } from "@/lib/schemas/charter";
import { defaultLocale, isLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import { fleetCompliance } from "@/server/compliance/vessels";
import { serverEnv } from "@/server/env";
import { integrations } from "@/server/integrations";
import type { Me } from "@/server/services/profile";
import { supabaseAdmin, type AdminDb } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

// §4.3 spot-charter board, requests and quotes. The public board reads through the server with an
// explicit column list: never the owner's minimum rate, never private documents (only the ones the
// owner picked for the listing, and only their type, status and expiry).

const appUrl = () => serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

// ----- Owner: listings ------------------------------------------------------------------------------

export async function listOwnListings(db: Db, orgId: string) {
  const { data, error } = await db
    .from("charter_listings")
    .select("*, vessel:vessels(name, type)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  return data;
}

export async function saveListing(db: Db, orgId: string, currency: string, input: ListingInput, id?: string) {
  const row = {
    org_id: orgId,
    vessel_id: input.vesselId,
    currency,
    day_rate_minor: String(fromMajor(input.dayRate, currency).amountMinor),
    min_rate_minor: input.minRate ? String(fromMajor(input.minRate, currency).amountMinor) : null,
    min_days: input.minDays,
    operating_area: input.operatingArea,
    available_from: input.availableFrom ?? null,
    available_to: input.availableTo ?? null,
    description: input.description ?? null,
    status: input.status,
    public_document_ids: input.publicDocumentIds,
  };
  const q = id
    ? db
        .from("charter_listings")
        .update(row as never)
        .eq("id", id)
        .select("id")
        .maybeSingle()
    : db
        .from("charter_listings")
        .insert(row as never)
        .select("id")
        .single();
  const { data, error } = await q;
  if (error) throw error.message === "invalid_subject" ? new ServiceError("validation") : fromDbError(error);
  if (!data) throw new ServiceError("forbidden");
  return data.id;
}

// ----- Public board -----------------------------------------------------------------------------------

/** The only listing columns the public sees. */
const PUBLIC_LISTING =
  "id, currency, day_rate_minor, min_days, operating_area, available_from, available_to, description, public_document_ids, org_id, vessel:vessels(id, name, type, passenger_capacity, cargo_capacity_t, length_m, year_built, crew_complement, speed_kn, deck_space_m2, dp_class, operating_country_code, ferry_enabled, charter_enabled), org:orgs(name, verification_status)";

export interface BoardFilters {
  type?: string;
  area?: string;
  from?: string;
  to?: string;
  minCapacity?: number;
}

type PublicRow = {
  id: string;
  currency: string;
  day_rate_minor: number;
  min_days: number;
  operating_area: string;
  available_from: string | null;
  available_to: string | null;
  description: string | null;
  public_document_ids: string[];
  org_id: string;
  vessel: {
    id: string;
    name: string;
    type: string;
    passenger_capacity: number | null;
    cargo_capacity_t: number | null;
    length_m: number | null;
    year_built: number | null;
    crew_complement: number | null;
    speed_kn: number | null;
    deck_space_m2: number | null;
    dp_class: string | null;
    operating_country_code: string;
    ferry_enabled: boolean;
    charter_enabled: boolean;
  } | null;
  org: { name: string; verification_status: string } | null;
};

async function complianceFor(db: AdminDb, row: PublicRow): Promise<number | null> {
  if (!row.vessel) return null;
  const [c] = await fleetCompliance(db as unknown as Db, row.org_id, [
    {
      id: row.vessel.id,
      name: row.vessel.name,
      type: row.vessel.type,
      operating_country_code: row.vessel.operating_country_code,
      ferry_enabled: row.vessel.ferry_enabled,
      charter_enabled: row.vessel.charter_enabled,
    },
  ]);
  // Whole percent for display (the engine scores 0–1).
  return c ? Math.round(c.score.score * 100) : null;
}

function publicShape(row: PublicRow, compliance: number | null) {
  const v = row.vessel!;
  return {
    id: row.id,
    vessel: {
      name: v.name,
      type: v.type,
      passengerCapacity: v.passenger_capacity,
      cargoCapacityT: v.cargo_capacity_t,
      lengthM: v.length_m,
      yearBuilt: v.year_built,
      crewComplement: v.crew_complement,
      speedKn: v.speed_kn,
      deckSpaceM2: v.deck_space_m2,
      dpClass: v.dp_class,
    },
    operator: { name: row.org?.name ?? "", verified: row.org?.verification_status === "verified" },
    dayRate: money(BigInt(row.day_rate_minor), row.currency),
    minDays: row.min_days,
    operatingArea: row.operating_area,
    availableFrom: row.available_from,
    availableTo: row.available_to,
    description: row.description,
    compliance,
  };
}

export type PublicListing = ReturnType<typeof publicShape>;

export async function boardListings(filters: BoardFilters): Promise<PublicListing[]> {
  if (!(await flagEnabled("charter"))) throw new ServiceError("not_found");
  const db = supabaseAdmin();
  let q = db.from("charter_listings").select(PUBLIC_LISTING).eq("status", "live");
  if (filters.area) q = q.ilike("operating_area", `%${filters.area.replace(/[%_]/g, "")}%`);
  // Overlap with the wanted dates (open-ended availability counts as available).
  if (filters.to) q = q.or(`available_from.is.null,available_from.lte.${filters.to}`);
  if (filters.from) q = q.or(`available_to.is.null,available_to.gte.${filters.from}`);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) throw fromDbError(error);
  const rows = (data as unknown as PublicRow[]).filter(
    (r) =>
      r.vessel &&
      (!filters.type || r.vessel.type === filters.type) &&
      (!filters.minCapacity || (r.vessel.passenger_capacity ?? 0) >= filters.minCapacity),
  );
  return Promise.all(rows.map(async (r) => publicShape(r, await complianceFor(db, r))));
}

/** One listing for the public page, with only the documents the owner chose to show. */
export async function boardListing(id: string) {
  if (!(await flagEnabled("charter"))) throw new ServiceError("not_found");
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("charter_listings")
    .select(PUBLIC_LISTING)
    .eq("id", id)
    .eq("status", "live")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ServiceError("not_found");
  const row = data as unknown as PublicRow;
  const ids = row.public_document_ids;
  const { data: docs } = ids.length
    ? await db
        .from("documents_live")
        .select("id, document_type_code, effective_status, expiry_date")
        .eq("org_id", row.org_id)
        .in("id", ids)
    : { data: [] };
  return {
    ...publicShape(row, await complianceFor(db, row)),
    documents: (docs ?? []).map((d) => ({
      type: d.document_type_code,
      status: d.effective_status,
      expiryDate: d.expiry_date,
    })),
  };
}

// ----- Requests and quotes ----------------------------------------------------------------------------

const CHARTER_SIDE = ["owner", "manager", "charterer"];

export async function createRequest(db: Db, me: Me, chartererOrgId: string, input: RequestInput) {
  const role = me.memberships.find((m) => m.orgId === chartererOrgId && m.status === "active")?.role;
  if (!role || !CHARTER_SIDE.includes(role)) throw new ServiceError("forbidden");
  await enforceLimit("charterRequestPerUser", me.userId);
  const currency = input.currency ?? null;
  const { data, error } = await db
    .from("charter_requests")
    .insert({
      charterer_org_id: chartererOrgId,
      listing_id: input.listingId ?? null,
      requested_by: me.userId,
      vessel_type: input.vesselType ?? null,
      start_date: input.startDate,
      end_date: input.endDate,
      location: input.location,
      country_code: input.countryCode ?? null,
      purpose: input.purpose,
      crew_needs: input.crewNeeds ?? null,
      budget_minor: input.budget && currency ? String(fromMajor(input.budget, currency).amountMinor) : null,
      currency,
    } as never)
    .select("id, owner_org_id, charterer_org_id, location, start_date, end_date")
    .single();
  if (error) throw fromDbError(error);
  if (data.owner_org_id) {
    await notifyOrg(data.owner_org_id, ["owner", "manager"], "charter_request", {
      location: data.location,
      dates: `${data.start_date} – ${data.end_date}`,
      link: `${appUrl()}/charters/requests`,
    });
  }
  return data.id;
}

/** Requests the org has sent (charterer) or received (owner), each with its quotes. */
export async function listRequests(db: Db, orgId: string) {
  const { data, error } = await db
    .from("charter_requests")
    .select("*, listing:charter_listings(id, vessel_id), quotes:charter_quotes(*)")
    .or(`charterer_org_id.eq.${orgId},owner_org_id.eq.${orgId}`)
    .order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  // Counterparties see each other's company name (orgs RLS hides other orgs, rightly, otherwise).
  const ids = [
    ...new Set(
      data.flatMap((r) => [r.charterer_org_id, r.owner_org_id]).filter((x): x is string => !!x && x !== orgId),
    ),
  ];
  const { data: orgs } = ids.length
    ? await supabaseAdmin().from("orgs").select("id, name, verification_status").in("id", ids)
    : { data: [] };
  const names = new Map((orgs ?? []).map((o) => [o.id, o]));
  // Likewise the names of the vessels listed or quoted on these requests.
  const vesselIds = [
    ...new Set(
      data.flatMap((r) => [r.listing?.vessel_id, ...r.quotes.map((q) => q.vessel_id)]).filter((x): x is string => !!x),
    ),
  ];
  const { data: vessels } = vesselIds.length
    ? await supabaseAdmin().from("vessels").select("id, name").in("id", vesselIds)
    : { data: [] };
  const vesselName = new Map((vessels ?? []).map((v) => [v.id, v.name]));
  return data.map((r) => {
    const side = r.charterer_org_id === orgId ? ("charterer" as const) : ("owner" as const);
    const other = names.get(side === "owner" ? r.charterer_org_id : (r.owner_org_id ?? ""));
    return {
      ...r,
      side,
      counterparty: other ? { name: other.name, verified: other.verification_status === "verified" } : null,
      vesselName: r.listing?.vessel_id ? (vesselName.get(r.listing.vessel_id) ?? null) : null,
      quotes: r.quotes.map((q) => ({ ...q, vesselName: vesselName.get(q.vessel_id) ?? "" })),
    };
  });
}

export async function sendQuote(db: Db, ownerOrgId: string, currency: string, requestId: string, input: QuoteInput) {
  const { data, error } = await db
    .from("charter_quotes")
    .insert({
      owner_org_id: ownerOrgId,
      request_id: requestId,
      vessel_id: input.vesselId,
      currency,
      day_rate_minor: String(fromMajor(input.dayRate, currency).amountMinor),
      mobilisation_minor: String(fromMajor(input.mobilisation ?? "0", currency).amountMinor),
      terms: { fuel: input.fuelTerms ?? null, payment: input.paymentTerms ?? null, notes: input.notes ?? null },
      valid_until: input.validUntil,
    } as never)
    .select("id, request:charter_requests(charterer_org_id, location)")
    .single();
  if (error) throw fromDbError(error);
  const request = Array.isArray(data.request) ? data.request[0] : data.request;
  if (request) {
    await notifyOrg(request.charterer_org_id, ["owner", "manager", "charterer"], "charter_quote", {
      location: request.location,
      amount: formatMoney(fromMajor(input.dayRate, currency), defaultLocale),
      link: `${appUrl()}/charters/requests`,
    });
  }
  return data.id;
}

export async function decideQuote(db: Db, quoteId: string, decision: "accept" | "decline") {
  if (decision === "decline") {
    const { error } = await db.rpc("decline_charter_quote", { p_quote: quoteId });
    if (error) throw fromDbError(error);
    return null;
  }
  const { data, error } = await db.rpc("accept_charter_quote", { p_quote: quoteId });
  if (error) throw fromDbError(error);
  const { data: charter } = await supabaseAdmin()
    .from("charters")
    .select("owner_org_id, start_date, end_date, vessel:vessels(name)")
    .eq("id", data)
    .single();
  if (charter) {
    await notifyOrg(charter.owner_org_id, ["owner", "manager"], "charter_accepted", {
      vessel: charter.vessel?.name ?? "",
      dates: `${charter.start_date} – ${charter.end_date}`,
      link: `${appUrl()}/charters/requests`,
    });
  }
  return data;
}

// ----- Notifications (in-app + WhatsApp) --------------------------------------------------------------

async function notifyOrg(orgId: string, roles: string[], template: string, payload: Record<string, string>) {
  const db = supabaseAdmin();
  const [{ data: org }, { data: members }] = await Promise.all([
    db.from("orgs").select("default_locale").eq("id", orgId).single(),
    db
      .from("memberships")
      .select("user_id, role, profile:profiles!memberships_user_id_profiles_id_fk(phone_e164)")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("role", roles as never),
  ]);
  if (!members?.length) return;
  await db.from("notifications").insert(members.map((m) => ({ org_id: orgId, user_id: m.user_id, template, payload })));
  const locale = org && isLocale(org.default_locale) ? org.default_locale : defaultLocale;
  const t = createTranslator({ locale, messages: await loadMessages(locale) }) as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  const text = t(`notifications.templates.${template}`, payload);
  await Promise.all(
    members.flatMap((m) =>
      m.profile?.phone_e164
        ? [
            integrations()
              .messaging.send({
                channel: "whatsapp",
                kind: "text",
                toE164: m.profile.phone_e164,
                text: `${text} ${payload.link ?? ""}`.trim(),
              })
              .catch(() => null),
          ]
        : [],
    ),
  );
}
