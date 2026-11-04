/** Locales with a message file. Enabling a locale for users is data (`locales.enabled`), added in M1b. */
export const locales = ["en", "en-NG"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Cookie holding the user's chosen locale (set from profile/org settings once those exist). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/**
 * Locale resolution: user setting → org default → browser → `en` (BUILD_SPEC §15).
 * User and org settings arrive later; until then the cookie stands in for both.
 */
export function resolveLocale(input: {
  userLocale?: string | null;
  orgLocale?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.userLocale)) return input.userLocale;
  if (isLocale(input.orgLocale)) return input.orgLocale;
  for (const tag of parseAcceptLanguage(input.acceptLanguage)) {
    if (isLocale(tag)) return tag;
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: normaliseTag(tag), q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
}

function normaliseTag(tag: string): string {
  const [lang = "", region] = tag.trim().split("-");
  return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
}
