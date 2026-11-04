import type { Money } from "@/lib/money";

/** What a payment is for. Mirrors payments.purpose / payment_provider_routes.purpose. */
export type PaymentPurpose = "ticket" | "subscription" | "invoice" | "charter_escrow" | "payout";

export type PaymentProviderId = "paystack" | "flutterwave" | "stripe" | "fake";

export interface CheckoutRequest {
  /** Our own reference; becomes payments.provider_ref when the provider echoes it back. */
  reference: string;
  amount: Money;
  purpose: PaymentPurpose;
  /** Payer contact the provider requires (email or E.164 phone). Never logged. */
  customer: { email?: string; phoneE164?: string; name?: string };
  callbackUrl: string;
  /** Provider subaccount to split settlement into, when configured. */
  splitSubaccountCode?: string;
  /** Platform share kept by us when splitting. */
  platformFee?: Money;
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  provider: PaymentProviderId;
  reference: string;
  /** URL to redirect the payer to. */
  checkoutUrl: string;
}

export type PaymentStatus = "initiated" | "success" | "failed" | "refunded";

export interface VerifiedPayment {
  provider: PaymentProviderId;
  reference: string;
  status: PaymentStatus;
  amount: Money;
  providerFee?: Money;
  paidAt?: Date;
}

/** One normalised event type for every provider's webhooks. */
export type PaymentEvent =
  | {
      kind: "charge.success" | "charge.failed";
      provider: PaymentProviderId;
      eventId: string;
      reference: string;
      amount: Money;
      providerFee?: Money;
      occurredAt: Date;
    }
  | {
      kind: "transfer.success" | "transfer.failed" | "transfer.reversed";
      provider: PaymentProviderId;
      eventId: string;
      transferRef: string;
      amount: Money;
      occurredAt: Date;
    }
  | {
      kind: "refund.processed";
      provider: PaymentProviderId;
      eventId: string;
      reference: string;
      amount: Money;
      occurredAt: Date;
    }
  | {
      kind: "subscription.renewed" | "subscription.disabled";
      provider: PaymentProviderId;
      eventId: string;
      subscriptionRef: string;
      occurredAt: Date;
    }
  | { kind: "ignored"; provider: PaymentProviderId; eventId: string };

export interface WebhookInput {
  rawBody: string;
  headers: Headers;
}

export interface BankAccountInput {
  countryCode: string;
  currency: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

export interface TransferRecipient {
  recipientCode: string;
  accountName: string;
  accountNumberLast4: string;
}

export interface TransferRequest {
  reference: string;
  recipientCode: string;
  amount: Money;
  reason: string;
}

export interface SubscriptionRequest {
  reference: string;
  planCode: string;
  amount: Money;
  quantity: number;
  customer: { email?: string; phoneE164?: string; name?: string };
  callbackUrl: string;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  supports(countryCode: string, currency: string, purpose: PaymentPurpose): boolean;
  initCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  verify(reference: string): Promise<VerifiedPayment>;
  createSubaccount(input: {
    businessName: string;
    bankAccount: BankAccountInput;
    /** Platform share in basis points. */
    percentageChargeBps: number;
  }): Promise<{ subaccountCode: string }>;
  createTransferRecipient(input: BankAccountInput): Promise<TransferRecipient>;
  transfer(req: TransferRequest): Promise<{ transferRef: string; status: "pending" | "success" | "failed" }>;
  refund(reference: string, amount?: Money): Promise<{ refundRef: string }>;
  createSubscription(req: SubscriptionRequest): Promise<CheckoutSession & { subscriptionRef?: string }>;
  /** Verifies the signature, then normalises. Throws WebhookSignatureError on a bad signature. */
  parseWebhook(input: WebhookInput): Promise<PaymentEvent>;
}

export class WebhookSignatureError extends Error {
  constructor(provider: PaymentProviderId) {
    super(`Invalid webhook signature from ${provider}`);
    this.name = "WebhookSignatureError";
  }
}
