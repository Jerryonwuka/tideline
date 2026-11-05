"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  invoiceInputSchema,
  offPlatformCharterSchema,
  recordPaymentSchema,
  sendInvoiceSchema,
} from "@/lib/schemas/invoices";
import { toMajorString } from "@/lib/money";
import { toE164 } from "@/lib/phone";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { acceptContract, generateContract, recordOffPlatformCharter } from "@/server/services/contracts";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { charterInvoiceDraft, createInvoice, recordInvoicePayment, sendInvoice } from "@/server/services/invoices";

export type ContractState = { error?: ErrorCode; ok?: boolean };
const code = (err: unknown): ErrorCode => (err instanceof ServiceError ? err.code : "unknown");
const opt = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : String(v));

export async function generateContractAction(_: ContractState, formData: FormData): Promise<ContractState> {
  const charterId = String(formData.get("charterId"));
  const { db } = await requireOrgContext(`/charters/${charterId}`);
  try {
    await generateContract(db, charterId, opt(formData.get("templateId")));
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/charters/${charterId}`);
  return { ok: true };
}

export async function acceptContractAction(_: ContractState, formData: FormData): Promise<ContractState> {
  const charterId = String(formData.get("charterId"));
  const { db } = await requireOrgContext(`/charters/${charterId}`);
  const h = await headers();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "validation" };
  try {
    await acceptContract(
      db,
      String(formData.get("contractId")),
      name,
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      h.get("user-agent"),
    );
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/charters/${charterId}`);
  return { ok: true };
}

export async function recordCharterAction(_: ContractState, formData: FormData): Promise<ContractState> {
  const { db, membership } = await requireOrgContext("/charters");
  const parsed = offPlatformCharterSchema.safeParse({
    vesselId: formData.get("vesselId"),
    clientName: formData.get("clientName"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    dayRate: formData.get("dayRate"),
    mobilisation: opt(formData.get("mobilisation")),
  });
  if (!parsed.success) return { error: "validation" };
  let id: string;
  try {
    const org = await orgBasics(db, membership.orgId);
    id = await recordOffPlatformCharter(db, membership.orgId, org.currency, parsed.data);
  } catch (err) {
    return { error: code(err) };
  }
  redirect(`/charters/${id}`);
}

export async function invoiceCharterAction(formData: FormData): Promise<void> {
  const charterId = String(formData.get("charterId"));
  const { db, membership } = await requireOrgContext(`/charters/${charterId}`);
  const draft = await charterInvoiceDraft(db, charterId);
  const id = await createInvoice(db, membership.orgId, {
    charterId,
    currency: draft.currency,
    billTo: draft.billTo,
    lines: draft.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: toMajorString(l.unit),
      kind: l.kind,
    })),
    addVat: formData.get("addVat") === "on",
  });
  redirect(`/invoices/${id}`);
}

export async function createInvoiceAction(_: ContractState, formData: FormData): Promise<ContractState> {
  const { db, membership } = await requireOrgContext("/invoices/new");
  const descriptions = formData.getAll("description").map(String);
  const parsed = invoiceInputSchema.safeParse({
    billTo: { name: formData.get("billTo"), address: opt(formData.get("address")) },
    lines: descriptions
      .map((d, i) => ({
        description: d,
        quantity: formData.getAll("quantity")[i],
        unitPrice: formData.getAll("unitPrice")[i],
        kind: formData.getAll("kind")[i] === "discount" ? "discount" : "charge",
      }))
      .filter((l) => l.description.trim()),
    addVat: formData.get("addVat") === "on",
    dueDate: opt(formData.get("dueDate")),
    notes: opt(formData.get("notes")),
  });
  if (!parsed.success) return { error: "validation" };
  let id: string;
  try {
    id = await createInvoice(db, membership.orgId, parsed.data);
  } catch (err) {
    return { error: code(err) };
  }
  redirect(`/invoices/${id}`);
}

export async function sendInvoiceAction(_: ContractState, formData: FormData): Promise<ContractState> {
  const id = String(formData.get("invoiceId"));
  const { db, membership } = await requireOrgContext(`/invoices/${id}`);
  const parsed = sendInvoiceSchema.safeParse({
    whatsapp: opt(formData.get("whatsapp")),
    email: opt(formData.get("email")),
  });
  if (!parsed.success) return { error: "validation" };
  const org = await orgBasics(db, membership.orgId);
  const whatsapp = parsed.data.whatsapp ? toE164(parsed.data.whatsapp, org.country_code) : undefined;
  if (parsed.data.whatsapp && !whatsapp) return { error: "invalid_phone" };
  try {
    await sendInvoice(db, id, { whatsapp: whatsapp ?? undefined, email: parsed.data.email });
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

export async function recordPaymentAction(_: ContractState, formData: FormData): Promise<ContractState> {
  const id = String(formData.get("invoiceId"));
  const { db, me } = await requireOrgContext(`/invoices/${id}`);
  const parsed = recordPaymentSchema.safeParse({ amount: formData.get("amount"), method: formData.get("method") });
  if (!parsed.success) return { error: "validation" };
  try {
    await recordInvoicePayment(db, me, id, parsed.data.amount, parsed.data.method);
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}
