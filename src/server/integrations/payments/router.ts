import type { PaymentProvider, PaymentProviderId, PaymentPurpose } from "./types";

/** A row of payment_provider_routes. */
export interface PaymentRoute {
  countryCode: string;
  currency: string;
  purpose: PaymentPurpose;
  provider: PaymentProviderId;
  priority: number;
  enabled: boolean;
}

export class NoPaymentRouteError extends Error {
  constructor(countryCode: string, currency: string, purpose: PaymentPurpose) {
    super(`No payment provider configured for ${countryCode}/${currency}/${purpose}`);
    this.name = "NoPaymentRouteError";
  }
}

/**
 * Picks a provider from configuration. Business code asks the router; it never names a provider.
 * Routes are tried by ascending priority; a route is skipped if its provider is not registered
 * or says it does not support the combination.
 */
export class PaymentRouter {
  private readonly providers: Map<PaymentProviderId, PaymentProvider>;

  constructor(
    private readonly routes: readonly PaymentRoute[],
    providers: readonly PaymentProvider[],
  ) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
  }

  candidates(countryCode: string, currency: string, purpose: PaymentPurpose): PaymentProvider[] {
    return this.routes
      .filter((r) => r.enabled && r.countryCode === countryCode && r.currency === currency && r.purpose === purpose)
      .sort((a, b) => a.priority - b.priority)
      .map((r) => this.providers.get(r.provider))
      .filter((p): p is PaymentProvider => !!p && p.supports(countryCode, currency, purpose));
  }

  pick(countryCode: string, currency: string, purpose: PaymentPurpose): PaymentProvider {
    const [first] = this.candidates(countryCode, currency, purpose);
    if (!first) throw new NoPaymentRouteError(countryCode, currency, purpose);
    return first;
  }
}
