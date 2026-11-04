import { PAYSTACK_COVERAGE } from "@/config/payment-providers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { money } from "@/lib/money";
import {
  WebhookSignatureError,
  type BankAccountInput,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
  type PaymentPurpose,
  type SubscriptionRequest,
  type TransferRequest,
  type VerifiedPayment,
  type WebhookInput,
} from "./types";
import type { Money } from "@/lib/money";

// Paystack (https://paystack.com/docs/api). Amounts are sent in the currency's subunit (kobo,
// pesewas, cents), which is our minor unit. Webhooks are signed with HMAC-SHA512 of the raw body
// using the secret key (x-paystack-signature).

const API = "https://api.paystack.co";
const COUNTRIES = new Set<string>(PAYSTACK_COVERAGE.countries);
const CURRENCIES = new Set<string>(PAYSTACK_COVERAGE.currencies);

/** Paystack needs an email; passengers may give only a phone, so a non-personal placeholder is used. */
const placeholderEmail = (reference: string) => `${reference.toLowerCase()}@payments.tideline.invalid`;

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

export class PaystackProvider implements PaymentProvider {
  readonly id = "paystack" as const;

  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  supports(countryCode: string, currency: string, purpose: PaymentPurpose): boolean {
    return COUNTRIES.has(countryCode) && CURRENCIES.has(currency) && purpose !== "charter_escrow";
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.secretKey}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json()) as PaystackResponse<T>;
    if (!res.ok || !json.status) throw new Error(`paystack ${path}: ${res.status}`);
    return json.data;
  }

  async initCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const data = await this.call<{ authorization_url: string; reference: string }>("POST", "/transaction/initialize", {
      email: req.customer.email ?? placeholderEmail(req.reference),
      amount: req.amount.amountMinor.toString(),
      currency: req.amount.currency,
      reference: req.reference,
      callback_url: req.callbackUrl,
      metadata: { purpose: req.purpose, ...req.metadata },
      ...(req.splitSubaccountCode
        ? {
            subaccount: req.splitSubaccountCode,
            // Our share as a flat amount; the operator's subaccount gets the rest.
            transaction_charge: (req.platformFee?.amountMinor ?? 0n).toString(),
            bearer: "subaccount",
          }
        : {}),
    });
    return { provider: this.id, reference: data.reference, checkoutUrl: data.authorization_url };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const d = await this.call<{
      status: string;
      reference: string;
      amount: number;
      currency: string;
      fees: number | null;
      paid_at: string | null;
    }>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
    return {
      provider: this.id,
      reference: d.reference,
      status: d.status === "success" ? "success" : d.status === "failed" ? "failed" : "initiated",
      amount: money(BigInt(d.amount), d.currency),
      ...(d.fees != null ? { providerFee: money(BigInt(d.fees), d.currency) } : {}),
      ...(d.paid_at ? { paidAt: new Date(d.paid_at) } : {}),
    };
  }

  async createSubaccount(input: { businessName: string; bankAccount: BankAccountInput; percentageChargeBps: number }) {
    const d = await this.call<{ subaccount_code: string }>("POST", "/subaccount", {
      business_name: input.businessName,
      settlement_bank: input.bankAccount.bankCode,
      account_number: input.bankAccount.accountNumber,
      percentage_charge: input.percentageChargeBps / 100,
    });
    return { subaccountCode: d.subaccount_code };
  }

  async createTransferRecipient(input: BankAccountInput) {
    const d = await this.call<{ recipient_code: string; details: { account_name: string } }>(
      "POST",
      "/transferrecipient",
      {
        type: "nuban",
        name: input.accountName,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: input.currency,
      },
    );
    return {
      recipientCode: d.recipient_code,
      accountName: d.details.account_name,
      accountNumberLast4: input.accountNumber.slice(-4),
    };
  }

  async transfer(req: TransferRequest) {
    const d = await this.call<{ status: string; reference: string }>("POST", "/transfer", {
      source: "balance",
      amount: req.amount.amountMinor.toString(),
      recipient: req.recipientCode,
      reference: req.reference,
      reason: req.reason,
    });
    const status = d.status === "success" ? "success" : d.status === "failed" ? "failed" : "pending";
    return { transferRef: d.reference ?? req.reference, status: status as "pending" | "success" | "failed" };
  }

  async refund(reference: string, amount?: Money) {
    const d = await this.call<{ id: number }>("POST", "/refund", {
      transaction: reference,
      ...(amount ? { amount: amount.amountMinor.toString() } : {}),
    });
    return { refundRef: String(d.id) };
  }

  /** One billing period paid by checkout; renewals start a new checkout (recurring plans later). */
  async createSubscription(req: SubscriptionRequest) {
    return this.initCheckout({
      reference: req.reference,
      amount: req.amount,
      purpose: "subscription",
      customer: req.customer,
      callbackUrl: req.callbackUrl,
      metadata: { plan: req.planCode, quantity: String(req.quantity) },
    });
  }

  async parseWebhook({ rawBody, headers }: WebhookInput): Promise<PaymentEvent> {
    const given = headers.get("x-paystack-signature") ?? "";
    const expected = createHmac("sha512", this.secretKey).update(rawBody).digest("hex");
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new WebhookSignatureError(this.id);
    }
    const body = JSON.parse(rawBody) as {
      event: string;
      data: {
        id: number;
        reference?: string;
        transaction_reference?: string;
        amount: number;
        currency: string;
        fees?: number | null;
        paid_at?: string | null;
        subscription_code?: string;
      };
    };
    const d = body.data;
    const eventId = `${body.event}:${d.id}`;
    const occurredAt = d.paid_at ? new Date(d.paid_at) : new Date();
    switch (body.event) {
      case "charge.success":
        return {
          kind: "charge.success",
          provider: this.id,
          eventId,
          reference: d.reference!,
          amount: money(BigInt(d.amount), d.currency),
          ...(d.fees != null ? { providerFee: money(BigInt(d.fees), d.currency) } : {}),
          occurredAt,
        };
      case "transfer.success":
      case "transfer.failed":
      case "transfer.reversed":
        return {
          kind: body.event,
          provider: this.id,
          eventId,
          transferRef: d.reference!,
          amount: money(BigInt(d.amount), d.currency),
          occurredAt,
        };
      case "refund.processed":
        return {
          kind: "refund.processed",
          provider: this.id,
          eventId,
          reference: d.transaction_reference!,
          amount: money(BigInt(d.amount), d.currency),
          occurredAt,
        };
      default:
        return { kind: "ignored", provider: this.id, eventId };
    }
  }
}
