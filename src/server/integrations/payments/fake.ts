import { createHmac, timingSafeEqual } from "node:crypto";
import { money, type Money } from "@/lib/money";
import {
  WebhookSignatureError,
  type BankAccountInput,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
  type PaymentProviderId,
  type PaymentPurpose,
  type SubscriptionRequest,
  type TransferRequest,
  type VerifiedPayment,
  type WebhookInput,
} from "./types";

export const FAKE_WEBHOOK_SECRET = "fake-webhook-secret";
export const FAKE_SIGNATURE_HEADER = "x-fake-signature";

interface FakeCharge {
  amount: Money;
  status: VerifiedPayment["status"];
}

/**
 * In-memory provider for tests and local dev. Supports every country/currency/purpose
 * unless `supported` narrows it, so routing tests can exercise fallbacks.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly charges = new Map<string, FakeCharge>();
  readonly transfers: TransferRequest[] = [];
  readonly refunds: { reference: string; amount?: Money }[] = [];

  /** `id` lets the fake stand in for a real provider, so routing works as configured (local dev). */
  constructor(
    private readonly supported?: (country: string, currency: string, purpose: PaymentPurpose) => boolean,
    readonly id: PaymentProviderId = "fake",
  ) {}

  supports(countryCode: string, currency: string, purpose: PaymentPurpose): boolean {
    return this.supported ? this.supported(countryCode, currency, purpose) : true;
  }

  async initCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    this.charges.set(req.reference, { amount: req.amount, status: "initiated" });
    return {
      provider: this.id,
      reference: req.reference,
      checkoutUrl: fakeCheckoutUrl(req.callbackUrl, req.reference),
    };
  }

  /** Test helper: mark a charge as paid, as if the payer completed checkout. */
  completeCharge(reference: string, status: "success" | "failed" = "success"): void {
    const charge = this.charges.get(reference);
    if (!charge) throw new Error(`Unknown fake charge ${reference}`);
    charge.status = status;
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const charge = this.charges.get(reference);
    if (!charge) throw new Error(`Unknown fake charge ${reference}`);
    return { provider: this.id, reference, status: charge.status, amount: charge.amount };
  }

  async createSubaccount(): Promise<{ subaccountCode: string }> {
    return { subaccountCode: `FAKE_SUB_${this.charges.size}_${Date.now()}` };
  }

  async createTransferRecipient(input: BankAccountInput) {
    return {
      recipientCode: `FAKE_RCP_${input.bankCode}_${input.accountNumber.slice(-4)}`,
      accountName: input.accountName,
      accountNumberLast4: input.accountNumber.slice(-4),
    };
  }

  async transfer(req: TransferRequest) {
    this.transfers.push(req);
    return { transferRef: req.reference, status: "pending" as const };
  }

  async refund(reference: string, amount?: Money) {
    this.refunds.push({ reference, amount });
    return { refundRef: `FAKE_RFD_${reference}` };
  }

  async createSubscription(req: SubscriptionRequest) {
    this.charges.set(req.reference, { amount: req.amount, status: "initiated" });
    return {
      provider: this.id,
      reference: req.reference,
      checkoutUrl: fakeCheckoutUrl(req.callbackUrl, req.reference),
      subscriptionRef: `FAKE_SUBSCR_${req.reference}`,
    };
  }

  /** Test helper: build a signed webhook body the way a real provider would. */
  static signedWebhook(body: unknown): WebhookInput {
    const rawBody = JSON.stringify(body);
    const headers = new Headers({ [FAKE_SIGNATURE_HEADER]: sign(rawBody) });
    return { rawBody, headers };
  }

  async parseWebhook({ rawBody, headers }: WebhookInput): Promise<PaymentEvent> {
    const given = headers.get(FAKE_SIGNATURE_HEADER) ?? "";
    const expected = sign(rawBody);
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new WebhookSignatureError(this.id);
    }
    const body = JSON.parse(rawBody) as {
      id: string;
      event: string;
      reference: string;
      amount_minor: string;
      currency: string;
    };
    if (body.event !== "charge.success" && body.event !== "charge.failed") {
      return { kind: "ignored", provider: this.id, eventId: body.id };
    }
    return {
      kind: body.event,
      provider: this.id,
      eventId: body.id,
      reference: body.reference,
      amount: money(BigInt(body.amount_minor), body.currency),
      occurredAt: new Date(),
    };
  }
}

function sign(rawBody: string): string {
  return createHmac("sha512", FAKE_WEBHOOK_SECRET).update(rawBody).digest("hex");
}

/** The local test checkout page (/dev/pay), which returns to the callback afterwards. */
function fakeCheckoutUrl(callbackUrl: string, reference: string): string {
  const url = new URL("/dev/pay", callbackUrl);
  url.searchParams.set("reference", reference);
  url.searchParams.set("return", callbackUrl);
  return url.toString();
}
