import "server-only";
import { randomBytes } from "node:crypto";
import { subscriptionAmount, ticketPrice, type FeeBearer } from "@/lib/fees";
import { money, type Money } from "@/lib/money";
import { toE164 } from "@/lib/phone";
import { serverEnv } from "@/server/env";
import { integrations } from "@/server/integrations";
import { PaymentRouter, type PaymentRoute } from "@/server/integrations/payments/router";
import type { PaymentEvent, PaymentProvider, WebhookInput } from "@/server/integrations/payments/types";
import type { Me } from "@/server/services/profile";
import { supabaseAdmin, type AdminDb } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";
import { applyInvoicePayment } from "./invoices";

// §11 tickets and subscriptions. The server (service role) writes payments, tickets, the ledger and
// webhook events; people only read them. A payment is only trusted once the provider confirms it
// (webhook or verify), never from the browser.

/** Seats are held this long while the buyer pays. */
const HOLD_MINUTES = 15;
/** Trips that were due to leave in the last two hours may still be boarding, so stay bookable. */
export const SALE_LOOKBACK_MS = 2 * 60 * 60_000;
const GRACE_DAYS = 7;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newTicketCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

const appUrl = () => serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

export async function paymentRouter(db: AdminDb | Db): Promise<PaymentRouter> {
  const { data, error } = await db.from("payment_provider_routes").select("*");
  if (error) throw fromDbError(error);
  const routes: PaymentRoute[] = data.map((r) => ({
    countryCode: r.country_code,
    currency: r.currency,
    purpose: r.purpose,
    provider: r.provider,
    priority: r.priority,
    enabled: r.enabled,
  }));
  return new PaymentRouter(routes, integrations().paymentProviders);
}

function providerById(id: string): PaymentProvider | undefined {
  return integrations().paymentProviders.find((p) => p.id === id);
}

export const feeBearerOf = (settings: unknown): FeeBearer =>
  (settings as { ticket_fee_bearer?: FeeBearer } | null)?.ticket_fee_bearer === "operator" ? "operator" : "passenger";

async function feeBps(db: AdminDb, key: string, country: string): Promise<number> {
  const { data, error } = await db.rpc("fee_bps", { p_key: key, p_country: country });
  if (error) throw fromDbError(error);
  return data ?? 0;
}

// ----- Trips open for sale -------------------------------------------------------------------------

const SALE_COLUMNS =
  "id, org_id, status, scheduled_departure, currency, route_id, vessel:vessels(passenger_capacity), route:routes(base_fare_minor, currency, duration_min, origin:jetties!routes_origin_jetty_id_jetties_id_fk(name, time_zone), destination:jetties!routes_destination_jetty_id_jetties_id_fk(name)), org:orgs(name, country_code, settings, default_locale)";

async function saleTrip(db: AdminDb, tripId: string) {
  const { data, error } = await db.from("trips").select(SALE_COLUMNS).eq("id", tripId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data || !data.route || !data.org) throw new ServiceError("not_found");
  return data;
}

async function seatsLeft(db: AdminDb, tripId: string, capacity: number | null): Promise<number | null> {
  if (capacity == null) return null;
  const [manifest, held] = await Promise.all([
    db.from("manifest_entries").select("seats").eq("trip_id", tripId),
    db
      .from("tickets")
      .select("qty")
      .eq("trip_id", tripId)
      .eq("status", "reserved")
      .gt("reserved_until", new Date().toISOString()),
  ]);
  const taken =
    (manifest.data ?? []).reduce((n, m) => n + m.seats, 0) + (held.data ?? []).reduce((n, t) => n + t.qty, 0);
  return Math.max(capacity - taken, 0);
}

/** Upcoming trips on routes with a fare, for the public booking page (no personal data). */
export async function tripsForSale(from: Date, to: Date) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("trips")
    .select(SALE_COLUMNS)
    .in("status", ["scheduled", "boarding"])
    .not("route_id", "is", null)
    .gte("scheduled_departure", from.toISOString())
    .lt("scheduled_departure", to.toISOString())
    .order("scheduled_departure");
  if (error) throw fromDbError(error);
  const rows = await Promise.all(
    data.map(async (t) => ({
      id: t.id,
      operator: t.org!.name,
      origin: t.route!.origin?.name ?? "",
      destination: t.route!.destination?.name ?? "",
      timeZone: t.route!.origin?.time_zone ?? "UTC",
      departure: t.scheduled_departure!,
      fare: money(t.route!.base_fare_minor, t.route!.currency),
      seatsLeft: await seatsLeft(db, t.id, t.vessel?.passenger_capacity ?? null),
    })),
  );
  return rows.filter((r) => r.seatsLeft === null || r.seatsLeft > 0);
}

export async function saleQuote(tripId: string, qty: number) {
  const db = supabaseAdmin();
  const trip = await saleTrip(db, tripId);
  const fare = money(trip.route!.base_fare_minor, trip.route!.currency);
  const bps = await feeBps(db, "ticket_fee_bps", trip.org!.country_code);
  const bearer = feeBearerOf(trip.org!.settings);
  return {
    trip,
    fare,
    bearer,
    bps,
    price: ticketPrice(fare, qty, bps, bearer),
    seatsLeft: await seatsLeft(db, tripId, trip.vessel?.passenger_capacity ?? null),
  };
}

// ----- Online checkout ---------------------------------------------------------------------------

async function reserve(
  db: AdminDb,
  tripId: string,
  input: { name: string; phoneE164: string | null; qty: number; channel: "online" | "agent_cash" | "agent_transfer" },
  quote: Awaited<ReturnType<typeof saleQuote>>,
  passengerUserId?: string,
) {
  const code = newTicketCode();
  const { data, error } = await db.rpc("reserve_ticket", {
    p_trip: tripId,
    p_qty: input.qty,
    p_buyer_name: input.name,
    p_buyer_phone: input.phoneE164 ?? "",
    p_code: code,
    p_channel: input.channel,
    p_unit_price_minor: Number(quote.fare.amountMinor),
    p_platform_fee_minor: Number(quote.price.platformFee.amountMinor),
    p_total_minor: Number(quote.price.total.amountMinor),
    p_currency: quote.fare.currency,
    p_fee_bearer: quote.bearer,
    p_hold_minutes: HOLD_MINUTES,
    ...(passengerUserId ? { p_passenger_user: passengerUserId } : {}),
  });
  if (error) throw fromDbError(error);
  return data;
}

export interface TicketPurchase {
  tripId: string;
  qty: number;
  name: string;
  phone?: string;
}

/** Holds the seats, records an initiated payment and returns the provider's checkout page. */
export async function startTicketCheckout(input: TicketPurchase, passengerUserId?: string) {
  const db = supabaseAdmin();
  const quote = await saleQuote(input.tripId, input.qty);
  const country = quote.trip.org!.country_code;
  const phoneE164 = input.phone ? toE164(input.phone, country) : null;
  if (input.phone && !phoneE164) throw new ServiceError("invalid_phone");
  const provider = (await paymentRouter(db)).pick(country, quote.fare.currency, "ticket");
  const ticket = await reserve(
    db,
    input.tripId,
    { name: input.name, phoneE164, qty: input.qty, channel: "online" },
    quote,
    passengerUserId,
  );
  const reference = `TKT-${ticket.code}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const { data: payment, error } = await db
    .from("payments")
    .insert({
      org_id: ticket.org_id,
      payer_user_id: passengerUserId ?? null,
      purpose: "ticket",
      reference_type: "ticket",
      reference_id: ticket.id,
      provider: provider.id,
      provider_ref: reference,
      currency: ticket.currency,
      amount_minor: String(quote.price.total.amountMinor),
      platform_fee_minor: String(quote.price.platformFee.amountMinor),
    } as never)
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  await db.from("tickets").update({ payment_id: payment.id }).eq("id", ticket.id);
  const { data: split } = await db
    .from("org_settlement_accounts")
    .select("subaccount_code")
    .eq("org_id", ticket.org_id)
    .eq("provider", provider.id)
    .maybeSingle();
  const session = await provider.initCheckout({
    reference,
    amount: quote.price.total,
    purpose: "ticket",
    customer: { ...(phoneE164 ? { phoneE164 } : {}), name: input.name },
    callbackUrl: `${appUrl()}/tickets/${ticket.code}`,
    ...(split ? { splitSubaccountCode: split.subaccount_code, platformFee: quote.price.platformFee } : {}),
    metadata: { ticket: ticket.code },
  });
  return { code: ticket.code, checkoutUrl: session.checkoutUrl, reference };
}

// ----- Agent sales (cash / transfer recorded at the jetty) ------------------------------------------

export async function recordAgentSale(userDb: Db, me: Me, input: TicketPurchase & { method: "cash" | "transfer" }) {
  // The seller must be able to see the trip (RLS) and sell for the org.
  const { data: visible } = await userDb.from("trips").select("id, org_id").eq("id", input.tripId).maybeSingle();
  if (!visible) throw new ServiceError("not_found");
  const role = me.memberships.find((m) => m.orgId === visible.org_id && m.status === "active")?.role;
  if (!role || !["owner", "manager", "captain"].includes(role)) throw new ServiceError("forbidden");

  const db = supabaseAdmin();
  const quote = await saleQuote(input.tripId, input.qty);
  const country = quote.trip.org!.country_code;
  const phoneE164 = input.phone ? toE164(input.phone, country) : null;
  if (input.phone && !phoneE164) throw new ServiceError("invalid_phone");
  const channel = input.method === "cash" ? "agent_cash" : "agent_transfer";
  const ticket = await reserve(db, input.tripId, { name: input.name, phoneE164, qty: input.qty, channel }, quote);
  const { data: payment, error } = await db
    .from("payments")
    .insert({
      org_id: ticket.org_id,
      payer_user_id: null,
      purpose: "ticket",
      reference_type: "ticket",
      reference_id: ticket.id,
      provider: input.method === "cash" ? "cash" : "transfer_manual",
      provider_ref: `AGT-${ticket.code}`,
      currency: ticket.currency,
      amount_minor: String(quote.price.total.amountMinor),
      platform_fee_minor: String(quote.price.platformFee.amountMinor),
      status: "success",
      paid_at: new Date().toISOString(),
      raw: { recorded_by: me.userId },
    } as never)
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  await db.from("tickets").update({ payment_id: payment.id }).eq("id", ticket.id);
  await fulfilTicket(db, ticket.id, payment.id);
  return ticket.code;
}

// ----- Confirmation (webhook, callback, reconciliation) -----------------------------------------

async function ledger(
  db: AdminDb,
  rows: {
    org_id: string | null;
    account: "platform_revenue" | "payee_payable" | "provider_fees";
    payment_id: string;
    currency: string;
    credit?: bigint;
    debit?: bigint;
    memo: string;
  }[],
) {
  const entries = rows
    .filter((r) => (r.credit ?? 0n) !== 0n || (r.debit ?? 0n) !== 0n)
    .map((r) => ({
      org_id: r.org_id,
      account: r.account,
      payment_id: r.payment_id,
      currency: r.currency,
      credit_minor: String(r.credit ?? 0n),
      debit_minor: String(r.debit ?? 0n),
      memo: r.memo,
    }));
  if (entries.length) await db.from("ledger_entries").insert(entries as never);
}

/** Paid ticket → passenger on the manifest. If the seats are gone (trip closed), refund. */
async function fulfilTicket(db: AdminDb, ticketId: string, paymentId: string) {
  const { data: ticket } = await db
    .from("tickets")
    .update({ status: "paid", reserved_until: null })
    .eq("id", ticketId)
    .eq("status", "reserved")
    .select("*")
    .maybeSingle();
  if (!ticket) return; // already fulfilled
  const { error } = await db.from("manifest_entries").insert({
    org_id: ticket.org_id,
    trip_id: ticket.trip_id,
    full_name: ticket.buyer_name,
    phone_e164: ticket.buyer_phone,
    seats: ticket.qty,
    ticket_id: ticket.id,
  });
  const { data: payment } = await db.from("payments").select("*").eq("id", paymentId).single();
  if (error) {
    // Capacity or a departed trip: the buyer gets their money back.
    await db.from("tickets").update({ status: "refunded" }).eq("id", ticket.id);
    const provider = payment ? providerById(payment.provider) : undefined;
    if (provider && payment) {
      await provider.refund(payment.provider_ref).catch(() => null);
      await db.from("payments").update({ status: "refunded" }).eq("id", paymentId);
    }
    await db.from("reconciliation_issues").insert({
      payment_id: paymentId,
      kind: "ticket_refunded_no_seat",
      detail: { code: error.message },
    });
    return;
  }
  if (payment) {
    const total = BigInt(payment.amount_minor);
    const fee = BigInt(payment.platform_fee_minor);
    // Passenger bears the fee: it was added on top. Operator bears it: it comes out of the fare.
    // Either way the operator is owed what was paid minus the platform fee.
    const operatorNet = total - fee;
    await ledger(db, [
      {
        org_id: ticket.org_id,
        account: "payee_payable",
        payment_id: paymentId,
        currency: ticket.currency,
        credit: operatorNet,
        memo: `ticket ${ticket.code}`,
      },
      {
        org_id: null,
        account: "platform_revenue",
        payment_id: paymentId,
        currency: ticket.currency,
        credit: fee,
        memo: `ticket fee ${ticket.code}`,
      },
    ]);
  }
}

async function fulfilSubscription(db: AdminDb, subscriptionId: string) {
  const { data: sub } = await db.from("subscriptions").select("*").eq("id", subscriptionId).single();
  if (!sub) return;
  const now = new Date();
  const start = sub.period_end && new Date(sub.period_end) > now ? new Date(sub.period_end) : now;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  await db
    .from("subscriptions")
    .update({ status: "active", period_start: start.toISOString(), period_end: end.toISOString() })
    .eq("id", subscriptionId);
}

/**
 * A confirmed charge. Idempotent: only an initiated payment moves to success, so a repeated
 * webhook or callback changes nothing. Amount and currency must match what we asked for.
 */
export async function applyChargeSuccess(
  db: AdminDb,
  reference: string,
  amount: Money,
  providerFee?: Money,
  raw?: unknown,
): Promise<"applied" | "duplicate" | "mismatch" | "unknown"> {
  const { data: payment } = await db.from("payments").select("*").eq("provider_ref", reference).maybeSingle();
  if (!payment) return "unknown";
  if (BigInt(payment.amount_minor) !== amount.amountMinor || payment.currency !== amount.currency) {
    await db.from("reconciliation_issues").insert({
      payment_id: payment.id,
      kind: "amount_mismatch",
      detail: {
        expected: `${payment.amount_minor} ${payment.currency}`,
        received: `${amount.amountMinor} ${amount.currency}`,
      },
    });
    return "mismatch";
  }
  const { data: moved } = await db
    .from("payments")
    .update({
      status: "success",
      paid_at: new Date().toISOString(),
      provider_fee_minor: String(providerFee?.amountMinor ?? 0n),
      raw: (raw ?? null) as never,
    } as never)
    .eq("id", payment.id)
    .eq("status", "initiated")
    .select("id")
    .maybeSingle();
  if (!moved) return "duplicate";
  if (providerFee && providerFee.amountMinor > 0n) {
    await ledger(db, [
      {
        org_id: null,
        account: "provider_fees",
        payment_id: payment.id,
        currency: payment.currency,
        debit: providerFee.amountMinor,
        memo: `provider fee ${reference}`,
      },
    ]);
  }
  if (payment.reference_type === "ticket") await fulfilTicket(db, payment.reference_id, payment.id);
  else if (payment.reference_type === "subscription") await fulfilSubscription(db, payment.reference_id);
  else if (payment.reference_type === "invoice")
    await applyInvoicePayment(db, payment.reference_id, BigInt(payment.amount_minor));
  return "applied";
}

async function applyChargeFailed(db: AdminDb, reference: string) {
  const { data } = await db
    .from("payments")
    .update({ status: "failed" })
    .eq("provider_ref", reference)
    .eq("status", "initiated")
    .select("reference_type, reference_id")
    .maybeSingle();
  if (data?.reference_type === "ticket") {
    await db.from("tickets").update({ status: "cancelled" }).eq("id", data.reference_id).eq("status", "reserved");
  }
}

/**
 * Provider webhooks: the signature is verified by the provider adapter, then each event id is
 * processed once (webhook_events). Returns what happened, for the response and tests.
 */
export async function handlePaymentWebhook(providerId: string, input: WebhookInput) {
  const provider = providerById(providerId);
  if (!provider) throw new ServiceError("not_found");
  const event: PaymentEvent = await provider.parseWebhook(input);
  const db = supabaseAdmin();
  const { data: fresh, error } = await db
    .from("webhook_events")
    .upsert(
      { provider: provider.id, event_id: event.eventId, payload: JSON.parse(input.rawBody) },
      { onConflict: "provider,event_id", ignoreDuplicates: true },
    )
    .select("event_id");
  if (error) throw fromDbError(error);
  if (!fresh.length) return { status: "duplicate" as const };

  let outcome: string = "ignored";
  if (event.kind === "charge.success") {
    outcome = await applyChargeSuccess(db, event.reference, event.amount, event.providerFee, {
      event: event.kind,
      id: event.eventId,
    });
  } else if (event.kind === "charge.failed") {
    await applyChargeFailed(db, event.reference);
    outcome = "failed";
  } else if (event.kind === "refund.processed") {
    await db.from("payments").update({ status: "refunded" }).eq("provider_ref", event.reference);
    outcome = "refunded";
  }
  await db
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", provider.id)
    .eq("event_id", event.eventId);
  return { status: "processed" as const, outcome };
}

/** On return from checkout: ask the provider (never trust the browser) and apply if paid. */
export async function confirmByVerify(reference: string) {
  const db = supabaseAdmin();
  const { data: payment } = await db
    .from("payments")
    .select("provider, status")
    .eq("provider_ref", reference)
    .maybeSingle();
  if (!payment || payment.status !== "initiated") return payment?.status ?? null;
  const provider = providerById(payment.provider);
  if (!provider) return payment.status;
  const verified = await provider.verify(reference).catch(() => null);
  if (verified?.status === "success") {
    await applyChargeSuccess(db, reference, verified.amount, verified.providerFee, { verified: true });
    return "success";
  }
  if (verified?.status === "failed") await applyChargeFailed(db, reference);
  return verified?.status ?? payment.status;
}

// ----- Tickets for passengers and boarding ------------------------------------------------------

/** Public ticket view by code (the code is the passenger's proof; no phone number shown). */
export async function ticketByCode(code: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tickets")
    .select(
      "id, code, status, qty, buyer_name, total_minor, platform_fee_minor, currency, fee_bearer, reserved_until, trip:trips(id, scheduled_departure, status, route:routes(origin:jetties!routes_origin_jetty_id_jetties_id_fk(name, time_zone), destination:jetties!routes_destination_jetty_id_jetties_id_fk(name)), vessel:vessels(name), org:orgs(name)), payment:payments!tickets_payment_id_payments_id_fk(provider_ref, status)",
    )
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}

/** Scan or type a code at the jetty: the passenger is marked boarded on the manifest. */
export async function boardTicket(userDb: Db, code: string, tripId?: string) {
  const db = supabaseAdmin();
  const { data: ticket } = await db
    .from("tickets")
    .select("id, trip_id, status, qty, buyer_name")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (!ticket) throw new ServiceError("ticket_not_found");
  // Only people who work this trip (or the office) may board it.
  const { data: visible } = await userDb.from("trips").select("id").eq("id", ticket.trip_id).maybeSingle();
  if (!visible) throw new ServiceError("ticket_not_found");
  if (tripId && ticket.trip_id !== tripId) throw new ServiceError("ticket_wrong_trip");
  if (ticket.status === "used") throw new ServiceError("ticket_used");
  if (ticket.status !== "paid") throw new ServiceError("ticket_not_paid");
  const { error } = await userDb
    .from("manifest_entries")
    .update({ boarded_at: new Date().toISOString() })
    .eq("ticket_id", ticket.id);
  if (error) throw fromDbError(error);
  await db.from("tickets").update({ status: "used" }).eq("id", ticket.id).eq("status", "paid");
  return { tripId: ticket.trip_id, name: ticket.buyer_name, seats: ticket.qty };
}

// ----- Subscriptions ------------------------------------------------------------------------------

export async function billingOverview(db: Db, orgId: string) {
  const { data: org, error } = await db.from("orgs").select("id, currency, country_code").eq("id", orgId).single();
  if (error) throw fromDbError(error);
  const [plans, prices, subs, vessels] = await Promise.all([
    db.from("plans").select("*").order("code"),
    db
      .from("plan_prices")
      .select("*")
      .eq("currency", org.currency)
      .lte("active_from", new Date().toISOString().slice(0, 10))
      .order("active_from", { ascending: false }),
    db.from("subscriptions").select("*").eq("org_id", orgId),
    db.from("vessels").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("charter_enabled", true),
  ]);
  const charterVessels = vessels.count ?? 0;
  const priceFor = (code: string) =>
    (prices.data ?? []).find(
      (p) => p.plan_code === code && (p.country_code === org.country_code || p.country_code === null),
    );
  return {
    currency: org.currency,
    charterVessels,
    plans: (plans.data ?? []).flatMap((p) => {
      const price = priceFor(p.code);
      if (!price) return [];
      const unitPrice = money(price.price_minor, price.currency);
      return [{ ...p, unitPrice, periodPrice: subscriptionAmount(unitPrice, p.unit, charterVessels) }];
    }),
    subscriptions: subs.data ?? [],
    writable: !(subs.data ?? []).some((s) => s.status === "read_only" || s.status === "cancelled"),
  };
}

/** Pays one billing period for a plan (§11): price × charter vessels for per-vessel plans. */
export async function startSubscriptionCheckout(userDb: Db, me: Me, orgId: string, planCode: string) {
  const role = me.memberships.find((m) => m.orgId === orgId && m.status === "active")?.role;
  if (role !== "owner") throw new ServiceError("forbidden");
  const overview = await billingOverview(userDb, orgId);
  const plan = overview.plans.find((p) => p.code === planCode);
  if (!plan) throw new ServiceError("not_found");
  const db = supabaseAdmin();
  const { data: org } = await db.from("orgs").select("country_code").eq("id", orgId).single();
  const quantity = plan.unit === "per_vessel" ? Math.max(overview.charterVessels, 1) : 1;
  const { data: sub, error } = await db
    .from("subscriptions")
    .upsert(
      {
        org_id: orgId,
        plan_code: plan.code,
        currency: plan.periodPrice.currency,
        quantity,
        amount_minor: String(plan.periodPrice.amountMinor),
      } as never,
      { onConflict: "org_id,plan_code" },
    )
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  const provider = (await paymentRouter(db)).pick(org!.country_code, plan.periodPrice.currency, "subscription");
  const reference = `SUB-${randomBytes(6).toString("hex").toUpperCase()}`;
  const { error: payError } = await db.from("payments").insert({
    org_id: orgId,
    payer_user_id: me.userId,
    payer_org_id: orgId,
    purpose: "subscription",
    reference_type: "subscription",
    reference_id: sub.id,
    provider: provider.id,
    provider_ref: reference,
    currency: plan.periodPrice.currency,
    amount_minor: String(plan.periodPrice.amountMinor),
  } as never);
  if (payError) throw fromDbError(payError);
  const session = await provider.createSubscription({
    reference,
    planCode: plan.code,
    amount: plan.periodPrice,
    quantity,
    customer: { ...(me.phone ? { phoneE164: me.phone } : {}), ...(me.fullName ? { name: me.fullName } : {}) },
    callbackUrl: `${appUrl()}/billing?reference=${reference}`,
  });
  return { checkoutUrl: session.checkoutUrl, reference };
}

// ----- Daily reconciliation -----------------------------------------------------------------------

/**
 * reconcile-payments (daily): asks providers about payments still initiated, releases expired seat
 * holds, and moves lapsed subscriptions to past_due and, after the grace period, read_only.
 */
export async function reconcilePayments(now: Date = new Date()) {
  const db = supabaseAdmin();
  const summary = { verified: 0, confirmed: 0, holdsReleased: 0, pastDue: 0, readOnly: 0 };

  const stale = new Date(now.getTime() - 15 * 60_000).toISOString();
  const oldest = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const { data: pending } = await db
    .from("payments")
    .select("provider_ref")
    .eq("status", "initiated")
    .lt("created_at", stale)
    .gt("created_at", oldest)
    .not("provider", "in", "(cash,transfer_manual)");
  for (const p of pending ?? []) {
    summary.verified += 1;
    if ((await confirmByVerify(p.provider_ref)) === "success") summary.confirmed += 1;
  }

  const { data: released } = await db
    .from("tickets")
    .update({ status: "cancelled" })
    .eq("status", "reserved")
    .lt("reserved_until", now.toISOString())
    .select("id");
  summary.holdsReleased = released?.length ?? 0;

  const { data: lapsed } = await db
    .from("subscriptions")
    .update({ status: "past_due" })
    .in("status", ["active", "trialing"])
    .lt("period_end", now.toISOString())
    .select("id");
  summary.pastDue = lapsed?.length ?? 0;
  const graceEnd = new Date(now.getTime() - GRACE_DAYS * 86_400_000).toISOString();
  const { data: locked } = await db
    .from("subscriptions")
    .update({ status: "read_only" })
    .eq("status", "past_due")
    .lt("period_end", graceEnd)
    .select("id");
  summary.readOnly = locked?.length ?? 0;
  return summary;
}
