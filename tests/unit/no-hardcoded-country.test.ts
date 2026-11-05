import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md rules 3 and 4a: no hard-coded launch-market values in application code. Country,
 * currency and time zone come from configuration (the countries table, rule sets, org settings).
 * Seed data, migrations, tests and src/config/ are allowed to name them.
 */
const FORBIDDEN = /(["'`])(NG|NGN|Africa\/Lagos)\1/;
const ALLOWED = [/^src\/config\//, /^src\/lib\/database\.types\.ts$/, /\.test\.tsx?$/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("no hard-coded launch-market values", () => {
  it("src/ names no country code, currency or time zone outside config", () => {
    const offenders: string[] = [];
    for (const file of files("src")) {
      const rel = relative(process.cwd(), file);
      if (ALLOWED.some((re) => re.test(rel))) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (FORBIDDEN.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("the check itself catches a violation", () => {
    expect(FORBIDDEN.test(`const currency = "NGN";`)).toBe(true);
    expect(FORBIDDEN.test(`if (country === 'NG') {}`)).toBe(true);
    expect(FORBIDDEN.test("zone: `Africa/Lagos`")).toBe(true);
    expect(FORBIDDEN.test(`const label = "NGO";`)).toBe(false);
  });
});
