import { defaultLocale, type Locale } from "./config";

type Messages = Record<string, unknown>;

/** Regional locales (en-NG) only override some keys; everything else falls back to the base language. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const base = (await import(`../../messages/${defaultLocale}.json`)).default as Messages;
  if (locale === defaultLocale) return base;
  const own = (await import(`../../messages/${locale}.json`)).default as Messages;
  return deepMerge(base, own);
}

function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] = isObject(current) && isObject(value) ? deepMerge(current, value) : value;
  }
  return out;
}

function isObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
