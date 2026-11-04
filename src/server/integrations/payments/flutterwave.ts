import { FLUTTERWAVE_COVERAGE } from "@/config/payment-providers";
import { timingSafeEqual } from "node:crypto";
import { fromMajor, subtract, toMajorString, type Money } from "@/lib/money";
import {
  WebhookSignatureError,
  type BankAccountInput,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
  type PaymentPurpose,
  type SubscriptionRequest,
  type VerifiedPayment,
  type WebhookInput,
} from "./types";

// Flutterwave v3 (https://developer.flutterwave.com). Amounts are in major units (decimal), so we
// convert at the edge. Webhooks carry the secret hash configured in the dashboard (verif-hash).

const API = "https://api.flutterwave.com/v3";
const COUNTRIES = new Set<string>(FLUTTERWAVE_COVERAGE.countries);
const CURRENCIES = new Set<string>(FLUTTERWAVE_COVERAGE.currencies);

const placeholderEmail = (reference: string) => `${reference.toLowerCase()}@payments.tideline.invalid`;

interface FlwResponse<T> {
  status: string;
  message: string;
  data: T;
}

export class FlutterwaveProvider implements PaymentProvider {
  readonly id = "flutterwave" as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookHash: string,
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
    const json = (await res.json()) as FlwResponse<T>;
    if (!res.ok || json.status !== "success") throw new Error(`flutterwave ${path}: ${res.status}`);
    return json.data;
  }

  async initCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const data = await this.call<{ link: string }>("POST", "/payments", {
      tx_ref: req.reference,
      amount: toMajorString(req.amount),
      currency: req.amount.currency,
      redirect_url: req.callbackUrl,
      customer: {
        email: req.customer.email ?? placeholderEmail(req.reference),
        ...(req.customer.phoneE164 ? { phonenumber: req.customer.phoneE164 } : {}),
        ...(req.customer.name ? { name: req.customer.name } : {}),
      },
      meta: { purpose: req.purpose, ...req.metadata },
      ...(req.splitSubaccountCode
        ? {
            subaccounts: [
              {
                id: req.splitSubaccountCode,
                transaction_charge_type: "flat_subaccount",
                transaction_charge: toMajorString(subtractFee(req.amount, req.platformFee)),
              },
            ],
          }
        : {}),
    });
    return { provider: this.id, reference: req.reference, checkoutUrl: data.link };
  }

  private async lookup(reference: string) {
    return this.call<{
      id: number;
      status: string;
      tx_ref: string;
      amount: number;
      currency: string;
      app_fee?: number;
      created_at?: string;
    }>("GET", `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const d = await this.lookup(reference);
    return {
      provider: this.id,
      reference: d.tx_ref,
      status: d.status === "successful" ? "success" : d.status === "failed" ? "failed" : "initiated",
      amount: fromMajor(String(d.amount), d.currency),
      ...(d.app_fee != null ? { providerFee: fromMajor(String(d.app_fee), d.currency) } : {}),
      ...(d.created_at ? { paidAt: new Date(d.created_at) } : {}),
    };
  }

  async createSubaccount(input: { businessName: string; bankAccount: BankAccountInput; percentageChargeBps: number }) {
    const d = await this.call<{ subaccount_id: string }>("POST", "/subaccounts", {
      account_bank: input.bankAccount.bankCode,
      account_number: input.bankAccount.accountNumber,
      business_name: input.businessName,
      country: input.bankAccount.countryCode,
      split_type: "percentage",
      split_value: input.percentageChargeBps / 10_000,
    });
    return { subaccountCode: d.subaccount_id };
  }

  async createTransferRecipient(input: BankAccountInput) {
    const d = await this.call<{ id: number; full_name: string }>("POST", "/beneficiaries", {
      account_bank: input.bankCode,
      account_number: input.accountNumber,
      beneficiary_name: input.accountName,
      currency: input.currency,
    });
    return { recipientCode: String(d.id), accountName: d.full_name, accountNumberLast4: input.accountNumber.slice(-4) };
  }

  /** Payouts use Paystack first; Flutterwave transfers arrive with escrow (M13). */
  async transfer(): Promise<{ transferRef: string; status: "pending" | "success" | "failed" }> {
    throw new Error("flutterwave transfers are not enabled yet");
  }

  async refund(reference: string, amount?: Money) {
    const tx = await this.lookup(reference);
    const d = await this.call<{ id: number }>(
      "POST",
      `/transactions/${tx.id}/refund`,
      amount ? { amount: toMajorString(amount) } : {},
    );
    return { refundRef: String(d.id) };
  }

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
    const given = headers.get("verif-hash") ?? "";
    if (
      !this.webhookHash ||
      given.length !== this.webhookHash.length ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(this.webhookHash))
    ) {
      throw new WebhookSignatureError(this.id);
    }
    const body = JSON.parse(rawBody) as {
      event: string;
      data: { id: number; tx_ref: string; amount: number; currency: string; status: string; app_fee?: number };
    };
    const d = body.data;
    const eventId = `${body.event}:${d.id}`;
    if (body.event !== "charge.completed") return { kind: "ignored", provider: this.id, eventId };
    // The webhook is a hint; the amount is re-checked against our payment row.
    return {
      kind: d.status === "successful" ? "charge.success" : "charge.failed",
      provider: this.id,
      eventId,
      reference: d.tx_ref,
      amount: fromMajor(String(d.amount), d.currency),
      ...(d.app_fee != null ? { providerFee: fromMajor(String(d.app_fee), d.currency) } : {}),
      occurredAt: new Date(),
    };
  }
}

/** The operator's flat share when the platform keeps a fee. */
const subtractFee = (amount: Money, fee?: Money): Money => (fee ? subtract(amount, fee) : amount);
