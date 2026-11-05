"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bankAccountSchema, disputeSchema } from "@/lib/schemas/escrow";
import { requireOrgContext } from "@/server/auth/session";
import { NoPaymentRouteError } from "@/server/integrations/payments/router";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import {
  addBankAccount,
  confirmHire,
  disputeEscrow,
  releaseEarly,
  startEscrowCheckout,
} from "@/server/services/escrow";

export type EscrowState = { error?: ErrorCode; ok?: boolean };
const code = (err: unknown): ErrorCode =>
  err instanceof ServiceError ? err.code : err instanceof NoPaymentRouteError ? "payments_unavailable" : "unknown";

export async function payEscrowAction(_: EscrowState, formData: FormData): Promise<EscrowState> {
  const charterId = String(formData.get("charterId"));
  const { db, me } = await requireOrgContext(`/charters/${charterId}`);
  let url: string;
  try {
    url = await startEscrowCheckout(db, me, charterId);
  } catch (err) {
    return { error: code(err) };
  }
  redirect(url);
}

export async function hireAction(_: EscrowState, formData: FormData): Promise<EscrowState> {
  const charterId = String(formData.get("charterId"));
  const { db, me } = await requireOrgContext(`/charters/${charterId}`);
  try {
    await confirmHire(db, me, charterId, formData.get("stage") === "off" ? "off" : "on");
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/charters/${charterId}`);
  return { ok: true };
}

export async function releaseEarlyAction(_: EscrowState, formData: FormData): Promise<EscrowState> {
  const charterId = String(formData.get("charterId"));
  const { db, me } = await requireOrgContext(`/charters/${charterId}`);
  try {
    await releaseEarly(db, me, String(formData.get("holdId")));
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/charters/${charterId}`);
  return { ok: true };
}

export async function disputeAction(_: EscrowState, formData: FormData): Promise<EscrowState> {
  const charterId = String(formData.get("charterId"));
  const { db } = await requireOrgContext(`/charters/${charterId}`);
  const parsed = disputeSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { error: "validation" };
  try {
    await disputeEscrow(db, String(formData.get("holdId")), parsed.data.reason);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/charters/${charterId}`);
  return { ok: true };
}

export async function addBankAccountAction(_: EscrowState, formData: FormData): Promise<EscrowState> {
  const { db, me, membership } = await requireOrgContext("/payouts");
  const parsed = bankAccountSchema.safeParse({
    bankCode: formData.get("bankCode"),
    accountNumber: formData.get("accountNumber"),
    accountName: formData.get("accountName"),
  });
  if (!parsed.success) return { error: "validation" };
  try {
    await addBankAccount(db, me, membership.orgId, parsed.data);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath("/payouts");
  return { ok: true };
}
