/**
 * Platform-wide configuration that M1b moves into the `countries` table. Until then this is the
 * single place a launch country appears; business logic reads it from here, never hard-codes it.
 */
export const platformConfig = {
  /** Countries an org can be created in (ISO 3166-1 alpha-2). */
  signupCountries: (process.env.NEXT_PUBLIC_SIGNUP_COUNTRIES ?? "NG").split(",").map((c) => c.trim()),
  /** Country used to read phone numbers typed without a +country prefix. */
  defaultPhoneCountry: process.env.NEXT_PUBLIC_DEFAULT_COUNTRY ?? "NG",
  /** How long an invitation link stays valid. */
  invitationTtlDays: 7,
} as const;
