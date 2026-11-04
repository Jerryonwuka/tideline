import "server-only";
import { enforceIpLimit } from "@/server/rate-limit";
import { randomBytes } from "node:crypto";
import { createTranslator } from "next-intl";
import type { Json } from "@/lib/database.types";
import { localDate } from "@/lib/dates";
import { hireDays, invoiceStatus, invoiceTotals, type InvoiceLine } from "@/lib/invoices";
import { fromMajor, money } from "@/lib/money";
import type { InvoiceInput } from "@/lib/schemas/invoices";
import { defaultLocale, isLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import { serverEnv } from "@/server/env";
import { integrations } from "@/server/integrations";
import type { Me } from "@/server/services/profile";
import { pdfMoney, renderPdf, type PdfBlock } from "@/server/pdf";
import { supabaseAdmin, type AdminDb } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { BUSINESS_BUCKET } from "./contracts";
import { fromDbError, ServiceError } from "./errors";
import { paymentRouter } from "./payments";

// §4.3 invoicing: from a charter (days on hire × day rate + mobilisation − discounts + VAT) or
// manual; per-org number series; PDF; sent by WhatsApp and email with a link to the client's
// invoice page, where it can be paid online. The invoices-overdue job flags late invoices and
// reminds the client once per interval (org setting, default 7 days).

const appUrl = () => serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
export const DEFAULT_REMINDER_DAYS = 7;

type StoredLine = { description: string; quantity: number; unit_minor: string; kind: "charge" | "discount" };
const toLines = (stored: StoredLine[]): InvoiceLine[] =>
  stored.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitMinor: BigInt(l.unit_minor),
    kind: l.kind,
  }));

/** VAT rate for the org's country (published rule set), or null. */
export async function vatRate(db: Db | AdminDb, countryCode: string): Promise<number | null> {
  const { data } = await db.rpc("tax_rate_for", { p_country: countryCode, p_code: "vat" });
  return data ?? null;
}

export async function createInvoice(db: Db, orgId: string, input: InvoiceInput) {
  const { data: org, error: orgError } = await db
    .from("orgs")
    .select("currency, country_code, default_locale")
    .eq("id", orgId)
    .single();
  if (orgError) throw fromDbError(orgError);
  const currency = input.currency ?? org.currency;
  const rate = input.addVat ? await vatRate(db, org.country_code) : null;
  if (input.addVat && rate == null) throw new ServiceError("validation", { addVat: "no_vat_rule" });
  const lines: InvoiceLine[] = input.lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitMinor: fromMajor(l.unitPrice, currency).amountMinor,
    kind: l.kind,
  }));
  const totals = invoiceTotals(lines, currency, rate);
  const { data: number, error: numError } = await db.rpc("next_invoice_number", { p_org: orgId });
  if (numError) throw fromDbError(numError);
  const { data, error } = await db
    .from("invoices")
    .insert({
      org_id: orgId,
      charter_id: input.charterId ?? null,
      number,
      bill_to: input.billTo as unknown as Json,
      line_items: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit_minor: String(l.unitMinor),
        kind: l.kind,
      })) as unknown as Json,
      currency,
      locale: org.default_locale,
      subtotal_minor: String(totals.subtotal.amountMinor),
      discount_minor: String(totals.discount.amountMinor),
      tax_minor: String(totals.tax.amountMinor),
      tax_rule_code: rate != null ? "vat" : null,
      tax_rate_bps: rate,
      total_minor: String(totals.total.amountMinor),
      due_date: input.dueDate ?? null,
      public_token: randomBytes(18).toString("base64url"),
      notes: input.notes ?? null,
    } as never)
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  return data.id;
}

/** Lines and bill-to for an invoice from a charter (days on hire × day rate + mobilisation). */
export async function charterInvoiceDraft(db: Db, charterId: string) {
  const { data: c } = await db
    .from("charters")
    .select(
      "id, owner_org_id, charterer_org_id, client_name, start_date, end_date, on_hire_at, off_hire_at, currency, day_rate_minor, mobilisation_minor, vessel:vessels(name)",
    )
    .eq("id", charterId)
    .maybeSingle();
  if (!c) throw new ServiceError("not_found");
  const { data: charterer } = c.charterer_org_id
    ? await supabaseAdmin().from("orgs").select("id, name").eq("id", c.charterer_org_id).single()
    : { data: null };
  const days = hireDays(c);
  const major = (minor: number | string) => money(BigInt(minor), c.currency);
  return {
    charterId: c.id,
    currency: c.currency,
    billTo: charterer ? { name: charterer.name, org_id: charterer.id } : { name: c.client_name ?? "" },
    lines: [
      {
        description: `${c.vessel?.name ?? "Vessel"} hire, ${days} day(s) (${c.start_date} – ${c.end_date})`,
        quantity: days,
        unit: major(c.day_rate_minor),
        kind: "charge" as const,
      },
      ...(BigInt(c.mobilisation_minor) > 0n
        ? [{ description: "Mobilisation", quantity: 1, unit: major(c.mobilisation_minor), kind: "charge" as const }]
        : []),
    ],
  };
}

async function invoicePdf(inv: InvoiceRow, issuer: { name: string }) {
  const lines = toLines(inv.line_items as StoredLine[]);
  const totals = invoiceTotals(lines, inv.currency, inv.tax_rate_bps);
  const bill = inv.bill_to as { name?: string; address?: string };
  const m = (x: Parameters<typeof pdfMoney>[0]) => pdfMoney(x, inv.locale);
  const blocks: PdfBlock[] = [
    { text: `Invoice ${inv.number}`, size: 18, bold: true },
    { text: issuer.name, size: 11, gapBefore: 4 },
    { text: `Issued ${inv.issue_date}${inv.due_date ? ` · Due ${inv.due_date}` : ""}`, size: 9 },
    { text: `Bill to: ${bill.name ?? ""}${bill.address ? `\n${bill.address}` : ""}`, size: 10, gapBefore: 14 },
    { text: "Item", bold: true, right: "Amount", gapBefore: 14 },
    ...totals.lines.map((l) => ({
      text: `${l.description} (${l.quantity} × ${m(l.unit)})`,
      right: `${l.kind === "discount" ? "-" : ""}${m(l.amount)}`,
    })),
    { text: "Subtotal", right: m(totals.subtotal), gapBefore: 10 },
    ...(totals.discount.amountMinor ? [{ text: "Discounts", right: `-${m(totals.discount)}` }] : []),
    ...(inv.tax_rate_bps ? [{ text: `VAT (${inv.tax_rate_bps / 100}%)`, right: m(totals.tax) }] : []),
    { text: "Total", bold: true, right: m(totals.total) },
    ...(BigInt(inv.amount_paid_minor) > 0n
      ? [{ text: "Paid", right: m(money(BigInt(inv.amount_paid_minor), inv.currency)) }]
      : []),
    { text: `Pay online: ${appUrl()}/i/${inv.public_token}`, size: 9, gapBefore: 18 },
    ...(inv.notes ? [{ text: inv.notes, size: 9, gapBefore: 8 }] : []),
  ];
  return renderPdf(`Invoice ${inv.number}`, blocks, `${issuer.name} · ${inv.number}`);
}

type InvoiceRow = {
  id: string;
  org_id: string;
  number: string;
  bill_to: Json;
  line_items: Json;
  currency: string;
  locale: string;
  tax_rate_bps: number | null;
  total_minor: number | string;
  amount_paid_minor: number | string;
  issue_date: string;
  due_date: string | null;
  status: "draft" | "sent" | "part_paid" | "paid" | "overdue" | "void";
  public_token: string;
  notes: string | null;
};

/** Renders and stores the PDF, marks it sent, and sends it by WhatsApp and/or email. */
export async function sendInvoice(db: Db, invoiceId: string, channels: { whatsapp?: string; email?: string }) {
  const { data: inv } = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!inv) throw new ServiceError("not_found");
  if (inv.status === "void") throw new ServiceError("invalid_transition");
  const admin = supabaseAdmin();
  const { data: org } = await admin.from("orgs").select("name, default_locale").eq("id", inv.org_id).single();
  const pdf = await invoicePdf(inv as InvoiceRow, { name: org?.name ?? "" });
  const path = `${inv.org_id}/invoices/${inv.id}.pdf`;
  const up = await admin.storage
    .from(BUSINESS_BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`invoice pdf: ${up.error.message}`);
  const link = `${appUrl()}/i/${inv.public_token}`;
  const { error } = await db
    .from("invoices")
    .update({
      pdf_path: path,
      payment_link: link,
      status: inv.status === "draft" ? "sent" : inv.status,
      sent_at: new Date().toISOString(),
      bill_to: {
        ...(inv.bill_to as object),
        ...(channels.whatsapp ? { phone: channels.whatsapp } : {}),
        ...(channels.email ? { email: channels.email } : {}),
      } as NonNullable<Json>,
    })
    .eq("id", inv.id);
  if (error) throw fromDbError(error);
  const t = await translator(inv.locale);
  const total = pdfMoney(money(BigInt(inv.total_minor), inv.currency), inv.locale);
  const text = t("invoices.message", { org: org?.name ?? "", number: inv.number, total, link });
  const { messaging, email } = integrations();
  if (channels.whatsapp)
    await messaging.send({ channel: "whatsapp", kind: "text", toE164: channels.whatsapp, text }).catch(() => null);
  if (channels.email) {
    await email
      .send({
        to: channels.email,
        subject: t("invoices.subject", { org: org?.name ?? "", number: inv.number }),
        text,
        attachments: [{ filename: `${inv.number}.pdf`, contentType: "application/pdf", content: pdf }],
      })
      .catch(() => null);
  }
  return { link, path };
}

async function translator(locale: string) {
  const l = isLocale(locale) ? locale : defaultLocale;
  return createTranslator({ locale: l, messages: await loadMessages(l) }) as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
}

/** Adds a payment to an invoice and moves its status (server only; amounts in the invoice currency). */
export async function applyInvoicePayment(admin: AdminDb, invoiceId: string, amountMinor: bigint, now = new Date()) {
  const { data: inv } = await admin.from("invoices").select("*, org:orgs(time_zone)").eq("id", invoiceId).single();
  if (!inv) return;
  const paid = BigInt(inv.amount_paid_minor) + amountMinor;
  const status = invoiceStatus(
    inv.status === "draft" ? "sent" : inv.status,
    BigInt(inv.total_minor),
    paid,
    inv.due_date,
    localDate(now, inv.org?.time_zone ?? "UTC"),
  );
  await admin
    .from("invoices")
    .update({ amount_paid_minor: String(paid), status } as never)
    .eq("id", invoiceId);
}

/** The issuer records a payment received outside the platform (cash, bank transfer). */
export async function recordInvoicePayment(
  db: Db,
  me: Me,
  invoiceId: string,
  amount: string,
  method: "cash" | "transfer",
) {
  const { data: inv } = await db
    .from("invoices")
    .select("id, org_id, currency, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) throw new ServiceError("not_found");
  const role = me.memberships.find((m) => m.orgId === inv.org_id && m.status === "active")?.role;
  if (role !== "owner" && role !== "manager") throw new ServiceError("forbidden");
  if (inv.status === "void" || inv.status === "draft") throw new ServiceError("invalid_transition");
  const value = fromMajor(amount, inv.currency).amountMinor;
  if (value <= 0n) throw new ServiceError("validation");
  const admin = supabaseAdmin();
  const { error } = await admin.from("payments").insert({
    org_id: inv.org_id,
    payer_user_id: null,
    purpose: "invoice",
    reference_type: "invoice",
    reference_id: inv.id,
    provider: method === "cash" ? "cash" : "transfer_manual",
    provider_ref: `INVREC-${randomBytes(6).toString("hex").toUpperCase()}`,
    currency: inv.currency,
    amount_minor: String(value),
    status: "success",
    paid_at: new Date().toISOString(),
    raw: { recorded_by: me.userId },
  } as never);
  if (error) throw fromDbError(error);
  await applyInvoicePayment(admin, inv.id, value);
}

/** Public: the client's invoice page by token (no login). */
export async function invoiceByToken(token: string) {
  const { data } = await supabaseAdmin()
    .from("invoices")
    .select(
      "id, org_id, number, bill_to, line_items, currency, locale, subtotal_minor, discount_minor, tax_minor, tax_rate_bps, total_minor, amount_paid_minor, issue_date, due_date, status, pdf_path, org:orgs(name, country_code)",
    )
    .eq("public_token", token)
    .neq("status", "draft")
    .maybeSingle();
  return data;
}

/** Public: pay the outstanding amount online (provider chosen by route; confirmed by webhook). */
export async function startInvoiceCheckout(token: string) {
  await enforceIpLimit("checkoutPerIp");
  const inv = await invoiceByToken(token);
  if (!inv || inv.status === "void" || inv.status === "paid") throw new ServiceError("not_found");
  const due = BigInt(inv.total_minor) - BigInt(inv.amount_paid_minor);
  if (due <= 0n) throw new ServiceError("invalid_transition");
  const admin = supabaseAdmin();
  const provider = (await paymentRouter(admin)).pick(inv.org?.country_code ?? "", inv.currency, "invoice");
  const reference = `INV-${randomBytes(6).toString("hex").toUpperCase()}`;
  const { error } = await admin.from("payments").insert({
    org_id: inv.org_id,
    purpose: "invoice",
    reference_type: "invoice",
    reference_id: inv.id,
    provider: provider.id,
    provider_ref: reference,
    currency: inv.currency,
    amount_minor: String(due),
  } as never);
  if (error) throw fromDbError(error);
  const session = await provider.initCheckout({
    reference,
    amount: money(due, inv.currency),
    purpose: "invoice",
    customer: { name: (inv.bill_to as { name?: string }).name },
    callbackUrl: `${appUrl()}/i/${token}`,
    metadata: { invoice: inv.number },
  });
  return session.checkoutUrl;
}

// ----- invoices-overdue job ---------------------------------------------------------------------

export async function runInvoicesOverdue(now = new Date()) {
  const admin = supabaseAdmin();
  const summary = { flagged: 0, reminded: 0 };
  const { data: open } = await admin
    .from("invoices")
    .select(
      "id, org_id, number, status, due_date, total_minor, amount_paid_minor, currency, locale, bill_to, public_token, last_reminded_at, org:orgs(name, time_zone, settings)",
    )
    .in("status", ["sent", "part_paid", "overdue"])
    .not("due_date", "is", null);
  for (const inv of open ?? []) {
    const today = localDate(now, inv.org?.time_zone ?? "UTC");
    if (!inv.due_date || inv.due_date >= today) continue;
    if (inv.status !== "overdue") {
      await admin.from("invoices").update({ status: "overdue" }).eq("id", inv.id).neq("status", "overdue");
      summary.flagged += 1;
    }
    // Remind once per interval: claim the reminder first so overlapping runs can't double-send.
    const days = Number(
      (inv.org?.settings as { invoice_reminder_days?: number } | null)?.invoice_reminder_days ?? DEFAULT_REMINDER_DAYS,
    );
    const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
    const { data: claimed } = await admin
      .from("invoices")
      .update({ last_reminded_at: now.toISOString() } as never)
      .eq("id", inv.id)
      .or(`last_reminded_at.is.null,last_reminded_at.lt.${cutoff}`)
      .select("id");
    if (!claimed?.length) continue;
    summary.reminded += 1;
    const t = await translator(inv.locale);
    const outstanding = pdfMoney(
      money(BigInt(inv.total_minor) - BigInt(inv.amount_paid_minor), inv.currency),
      inv.locale,
    );
    const text = t("invoices.reminder", {
      org: inv.org?.name ?? "",
      number: inv.number,
      amount: outstanding,
      link: `${appUrl()}/i/${inv.public_token}`,
    });
    const bill = inv.bill_to as { phone?: string; email?: string };
    const { messaging, email } = integrations();
    if (bill.phone)
      await messaging.send({ channel: "whatsapp", kind: "text", toE164: bill.phone, text }).catch(() => null);
    if (bill.email)
      await email
        .send({ to: bill.email, subject: t("invoices.reminderSubject", { number: inv.number }), text })
        .catch(() => null);
  }
  return summary;
}
