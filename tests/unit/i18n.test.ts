import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { locales, resolveLocale } from "@/i18n/config";

describe("resolveLocale", () => {
  it("prefers user, then org, then browser, then en", () => {
    expect(resolveLocale({ userLocale: "en-NG", orgLocale: "en" })).toBe("en-NG");
    expect(resolveLocale({ userLocale: "xx", orgLocale: "en-NG" })).toBe("en-NG");
    expect(resolveLocale({ acceptLanguage: "fr-FR;q=0.9, en-ng;q=0.8" })).toBe("en-NG");
    expect(resolveLocale({ acceptLanguage: "en-GB" })).toBe("en");
    expect(resolveLocale({ acceptLanguage: "fr" })).toBe("en");
    expect(resolveLocale({})).toBe("en");
  });
});

describe("message files", () => {
  const load = (locale: string) => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const keys = (obj: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "object" && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  const base = new Set(keys(load("en")));

  it.each(locales.filter((l) => l !== "en"))("%s only overrides keys that exist in en", (locale) => {
    expect(keys(load(locale)).filter((k) => !base.has(k))).toEqual([]);
  });
});
