import "server-only";
import { money } from "@/lib/money";
import { serverEnv } from "@/server/env";
import { escrowEnabled } from "@/server/features";
import { integrations } from "@/server/integrations";
import type { PaymentEvent } from "@/server/integrations/payments/types";
import type { Me } from "@/server/services/profile";
import { supabaseAdmin, type AdminDb } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";
import { paymentRouter } from "./payments";

// §11 escrow: the charterer pays the charter's value into the platform balance; funds are held and
// released by rule (mobilisation when both sides confirm on-hire, the rest when both confirm
// off-hire), each release paying the owner minus commission by provider transfer to a verified
// bank account. A dispute freezes releases until an admin resolves it (release, refund or split).
// The database functions lock the hold and claim each tranche once, so a double click or a repeated
// webhook can't pay twice. Off in production until the legal structure is confirmed.

const appUrl = () => serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

function assertEnabled() {
  if (!escrowEnabled()) throw new ServiceError("escrow_disabled");
}

export async function escrowForCharter(db: Db, charterId: string) {
  const { data: hold } = await db.from("escrow_holds").select("*").eq("charter_id", charterId).maybeSingle();
  if (!hold) return null;
  const [{ data: releases }, { data: payouts }] = await Promise.all([
    db.from("escrow_releases").select("*").eq("hold_id", hold.id).order("created_at"),
    db
      .from("payouts")
      .select("id, amount_minor, commission_minor, status, failure_reason, created_at")
      .eq("escrow_hold_id", hold.id),
  ]);
  return { hold, releases: releases ?? [], payouts: payouts ?? [] };
}

/** Charterer pays the charter's value into escrow (after both accepted the contract). */
export async function startEscrowCheckout(db: Db, me: Me, charterId: string) {
  assertEnabled();
  const { data: c } = await db.from("charters").select("*").eq("id", charterId).maybeSingle();
  if (!c || !c.charterer_org_id) throw new ServiceError("not_found");
  const role = me.memberships.find((m) => m.orgId === c.charterer_org_id && m.status === "active")?.role;
  if (!role || !["owner", "manager", "charterer"].includes(role)) throw new ServiceError("forbidden");
  if (c.status !== "pending_payment") throw new ServiceError("invalid_transition");
  const admin = supabaseAdmin();
  const provider = (await paymentRouter(admin)).pick(c.governing_country_code ?? "", c.currency, "charter_escrow");
  const reference = `ESC-${charterId.replace(/-/g, "").slice(0, 12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const { error } = await admin.from("payments").insert({
    org_id: c.owner_org_id,
    payer_user_id: me.userId,
    payer_org_id: c.charterer_org_id,
    purpose: "charter_escrow",
    reference_type: "charter",
    reference_id: c.id,
    provider: provider.id,
    provider_ref: reference,
    currency: c.currency,
    amount_minor: String(c.total_value_minor),
  } as never);
  if (error) throw fromDbError(error);
  const session = await provider.initCheckout({
    reference,
    amount: money(BigInt(c.total_value_minor), c.currency),
    purpose: "charter_escrow",
    customer: { ...(me.phone ? { phoneE164: me.phone } : {}), ...(me.fullName ? { name: me.fullName } : {}) },
    callbackUrl: `${appUrl()}/charters/${c.id}`,
    metadata: { charter: c.id },
  });
  return session.checkoutUrl;
}

/** Confirmed escrow payment → hold (idempotent; called from the payment confirmation). */
export async function fundEscrow(admin: AdminDb, paymentId: string) {
  const { data, error } = await admin.rpc("fund_escrow", { p_payment: paymentId });
  if (error) throw fromDbError(error);
  return data;
}

/** One side confirms on-hire / off-hire; when both have, the matching tranche is released. */
export async function confirmHire(db: Db, me: Me, charterId: string, stage: "on" | "off") {
  assertEnabled();
  const { data: state, error } = await db.rpc("confirm_hire", { p_charter: charterId, p_stage: stage });
  if (error) throw fromDbError(error);
  if (state !== "both") return { state, payout: null };
  const admin = supabaseAdmin();
  const { data: hold } = await admin
    .from("escrow_holds")
    .select("id, amount_minor, charter:charters(mobilisation_minor)")
    .eq("charter_id", charterId)
    .maybeSingle();
  if (!hold) return { state, payout: null };
  const gross = stage === "on" ? BigInt(hold.charter?.mobilisation_minor ?? 0) : BigInt(hold.amount_minor); // the rest (the function caps at what remains)
  if (gross <= 0n) return { state, payout: null };
  const payout = await release(admin, hold.id, stage === "on" ? "mobilisation" : "hire", gross, me.userId);
  return { state, payout };
}

async function release(admin: AdminDb, holdId: string, tranche: string, gross: bigint, by: string) {
  const { data: payoutId, error } = await admin.rpc("release_escrow", {
    p_hold: holdId,
    p_tranche: tranche,
    p_gross: Number(gross),
    p_by: by,
  });
  if (error) {
    // A second click or an overlapping run: the tranche was already released.
    if (error.message === "already_released" || error.message === "nothing_to_release") return null;
    throw fromDbError(error);
  }
  await processPayout(admin, payoutId);
  return payoutId;
}

/**
 * Sends a pending payout to the owner's verified bank account (provider transfer with our
 * reference, so a retry can't pay twice). Without an account it waits until one is added.
 */
export async function processPayout(admin: AdminDb, payoutId: string) {
  const { data: p } = await admin
    .from("payouts")
    .select("*, account:bank_accounts(provider_recipient_code, country_code), org:orgs(country_code)")
    .eq("id", payoutId)
    .single();
  if (!p || p.status !== "pending") return;
  if (!p.account) {
    await admin.from("payouts").update({ failure_reason: "no_bank_account" }).eq("id", p.id);
    return;
  }
  const provider = (await paymentRouter(admin)).pick(p.account.country_code, p.currency, "payout");
  const result = await provider
    .transfer({
      reference: p.provider_transfer_ref,
      recipientCode: p.account.provider_recipient_code,
      amount: money(BigInt(p.amount_minor), p.currency),
      reason: "Tideline charter payout",
    })
    .catch(() => ({ status: "failed" as const, transferRef: p.provider_transfer_ref }));
  if (result.status === "success") await settlePayout(admin, p.provider_transfer_ref, "success");
  else if (result.status === "failed") await settlePayout(admin, p.provider_transfer_ref, "failed");
  else await admin.from("payouts").update({ failure_reason: null }).eq("id", p.id);
}

/** Transfer outcome (immediate or by webhook). Idempotent: only a pending payout moves. */
export async function settlePayout(admin: AdminDb, transferRef: string, outcome: "success" | "failed" | "reversed") {
  const from = outcome === "reversed" ? ["success"] : ["pending"];
  const { data: p } = await admin
    .from("payouts")
    .update({ status: outcome, failure_reason: outcome === "success" ? null : outcome })
    .eq("provider_transfer_ref", transferRef)
    .in("status", from as never)
    .select("*, hold:escrow_holds(payment_id)")
    .maybeSingle();
  if (!p) return "duplicate";
  const entry = {
    org_id: p.org_id,
    account: "payee_payable" as const,
    payment_id: p.hold?.payment_id ?? null,
    payout_id: p.id,
    currency: p.currency,
    memo: `payout ${p.provider_transfer_ref} ${outcome}`,
  };
  // Paid out: the platform no longer owes the owner. Reversed: it owes them again.
  if (outcome === "success")
    await admin.from("ledger_entries").insert({ ...entry, debit_minor: String(p.amount_minor) } as never);
  if (outcome === "reversed")
    await admin.from("ledger_entries").insert({ ...entry, credit_minor: String(p.amount_minor) } as never);
  return "applied";
}

export async function applyTransferEvent(admin: AdminDb, event: Extract<PaymentEvent, { kind: `transfer.${string}` }>) {
  const outcome =
    event.kind === "transfer.success" ? "success" : event.kind === "transfer.reversed" ? "reversed" : "failed";
  return settlePayout(admin, event.transferRef, outcome);
}

/** The charterer releases what's left early (e.g. a short charter); same once-only rule. */
export async function releaseEarly(db: Db, me: Me, holdId: string) {
  assertEnabled();
  const { data: h } = await db
    .from("escrow_holds")
    .select("id, payer_org_id, amount_minor")
    .eq("id", holdId)
    .maybeSingle();
  if (!h) throw new ServiceError("not_found");
  const role = me.memberships.find((m) => m.orgId === h.payer_org_id && m.status === "active")?.role;
  if (!role || !["owner", "manager", "charterer"].includes(role)) throw new ServiceError("forbidden");
  return release(supabaseAdmin(), h.id, "early_release", BigInt(h.amount_minor), me.userId);
}

export async function disputeEscrow(db: Db, holdId: string, reason: string) {
  assertEnabled();
  const { error } = await db.rpc("dispute_escrow", { p_hold: holdId, p_reason: reason });
  if (error) throw fromDbError(error);
}

/** Platform admin resolves a dispute: release to the owner, refund the charterer, or split. */
export async function resolveDispute(
  me: Me,
  holdId: string,
  action: "release" | "refund" | "split",
  ownerShareMinor?: bigint,
) {
  if (!me.isPlatformAdmin) throw new ServiceError("forbidden");
  const admin = supabaseAdmin();
  const { data: h } = await admin.from("escrow_holds").select("*").eq("id", holdId).single();
  if (!h) throw new ServiceError("not_found");
  if (h.status !== "disputed") throw new ServiceError("invalid_transition");
  const remaining = BigInt(h.amount_minor) - BigInt(h.released_minor) - BigInt(h.refunded_minor);
  const toOwner = action === "release" ? remaining : action === "refund" ? 0n : (ownerShareMinor ?? 0n);
  if (toOwner < 0n || toOwner > remaining) throw new ServiceError("validation");
  const toCharterer = remaining - toOwner;
  if (toOwner > 0n) await release(admin, holdId, "admin_release", toOwner, me.userId);
  if (toCharterer > 0n) {
    const { error } = await admin.rpc("refund_escrow", {
      p_hold: holdId,
      p_tranche: "admin_refund",
      p_amount: Number(toCharterer),
      p_by: me.userId,
    });
    if (error && error.message !== "already_released") throw fromDbError(error);
    const { data: payment } = await admin
      .from("payments")
      .select("provider, provider_ref")
      .eq("id", h.payment_id)
      .single();
    const provider = integrations().paymentProviders.find((p) => p.id === payment?.provider);
    if (provider && payment)
      await provider.refund(payment.provider_ref, money(toCharterer, h.currency)).catch(() => null);
  }
  await admin
    .from("charters")
    .update({ status: toOwner > 0n ? "completed" : "cancelled" })
    .eq("id", h.charter_id);
  return { toOwner, toCharterer };
}

export async function listDisputes() {
  const { data, error } = await supabaseAdmin()
    .from("escrow_holds")
    .select(
      "id, charter_id, currency, amount_minor, released_minor, refunded_minor, status, dispute_reason, updated_at, payee:orgs!escrow_holds_payee_org_id_orgs_id_fk(name), payer:orgs!escrow_holds_payer_org_id_orgs_id_fk(name)",
    )
    .eq("status", "disputed")
    .order("updated_at", { ascending: false });
  if (error) throw fromDbError(error);
  return data;
}

// ----- Bank accounts ------------------------------------------------------------------------------

/** Owner adds a payout account; the provider resolves the account name. Only the last 4 digits are kept. */
export async function addBankAccount(
  db: Db,
  me: Me,
  orgId: string,
  input: { bankCode: string; accountNumber: string; accountName: string },
) {
  const role = me.memberships.find((m) => m.orgId === orgId && m.status === "active")?.role;
  if (role !== "owner") throw new ServiceError("forbidden");
  const { data: org } = await db.from("orgs").select("country_code, currency").eq("id", orgId).single();
  if (!org) throw new ServiceError("not_found");
  const admin = supabaseAdmin();
  const provider = (await paymentRouter(admin)).pick(org.country_code, org.currency, "payout");
  const recipient = await provider.createTransferRecipient({
    countryCode: org.country_code,
    currency: org.currency,
    bankCode: input.bankCode,
    accountNumber: input.accountNumber,
    accountName: input.accountName,
  });
  const { data, error } = await admin
    .from("bank_accounts")
    .insert({
      org_id: orgId,
      country_code: org.country_code,
      currency: org.currency,
      provider: provider.id,
      bank_code: input.bankCode,
      account_number_last4: recipient.accountNumberLast4,
      account_name: recipient.accountName,
      provider_recipient_code: recipient.recipientCode,
      verified: true,
    })
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  // Payouts that were waiting for an account go now.
  const { data: waiting } = await admin
    .from("payouts")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .is("bank_account_id", null);
  for (const w of waiting ?? []) {
    await admin.from("payouts").update({ bank_account_id: data.id }).eq("id", w.id);
    await processPayout(admin, w.id);
  }
  return data.id;
}
