// Where each payment provider operates (from the providers' own docs). Which provider a country
// actually uses is decided by payment_provider_routes, not here.

export const PAYSTACK_COVERAGE = {
  countries: ["NG", "GH", "ZA", "KE", "CI"],
  currencies: ["NGN", "GHS", "ZAR", "KES", "USD", "XOF"],
} as const;

export const FLUTTERWAVE_COVERAGE = {
  countries: ["NG", "GH", "KE", "UG", "ZA", "TZ", "RW", "CI", "SN"],
  currencies: ["NGN", "GHS", "KES", "UGX", "ZAR", "TZS", "RWF", "XOF", "USD"],
} as const;
