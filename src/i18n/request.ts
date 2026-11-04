import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, defaultLocale, resolveLocale, type Locale } from "./config";

type Messages = Record<string, unknown>;

/** Regional locales (en-NG) only override some keys; everything else falls back to the base language. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const base = (await import(`../../messages/${defaultLocale}.json`)).default as Messages;
  if (locale === defaultLocale) return base;
  const own = (await import(`../../messages/${locale}.json`)).default as Messages;
  return deepMerge(base, own);
}

export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale({
    userLocale: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });
  return { locale, messages: await loadMessages(locale) };
});

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
