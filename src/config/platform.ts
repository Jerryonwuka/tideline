/**
 * Platform-wide configuration. Countries, currencies and their rules live in the database
 * (countries, compliance_rule_sets); this file holds only what is needed before we know a user's
 * org, and is one of the few places allowed to name a launch country.
 */
export const platformConfig = {
  /** Country used to read phone numbers typed without a +country prefix (login happens before any org exists). */
  defaultPhoneCountry: process.env.NEXT_PUBLIC_DEFAULT_COUNTRY ?? "NG",
  /** How long an invitation link stays valid. */
  invitationTtlDays: 7,
} as const;
