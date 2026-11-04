import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Normalises what a person typed ("0803 000 0001", "+234 803…", "234803…") to E.164, using the
 * given country for numbers without an international prefix. Returns null if it is not a valid number.
 */
export function toE164(input: string, defaultCountry: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
  if (parsed?.isValid()) return parsed.number;
  // "234803…" typed without the plus.
  if (/^\d{8,15}$/.test(trimmed)) {
    const withPlus = parsePhoneNumberFromString(`+${trimmed}`);
    if (withPlus?.isValid()) return withPlus.number;
  }
  return null;
}

/** Human display, e.g. "+234 803 000 0001". */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/** Masked display for places that only need a hint of the number, e.g. "+234 ••• ••• 0001". */
export function maskPhone(e164: string): string {
  const formatted = formatPhone(e164);
  const digits = formatted.replace(/\D/g, "");
  const keep = digits.slice(-4);
  const [cc] = formatted.split(" ");
  return `${cc} ••• ••• ${keep}`;
}
