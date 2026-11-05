import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "@/config/limits";
import { PROCESSORS } from "@/config/privacy";
import { SentryErrorReporter } from "@/server/integrations/errors/sentry";
import { FakeErrorReporter } from "@/server/integrations/errors/fake";
import { redact, reportError, setErrorReporterForTesting } from "@/server/log";

describe("PII-free logging", () => {
  it("phone numbers become stable hashes; emails are masked", () => {
    const out = redact("Failed for +2348031234567 and 0803 123 4567, mail ada@example.com");
    expect(out).not.toContain("2348031234567");
    expect(out).not.toContain("0803 123 4567");
    expect(out).not.toContain("ada@example.com");
    expect(out).toMatch(/phone#[0-9a-f]{16}/);
    expect(redact("+2348031234567")).toBe(redact("+2348031234567"));
  });

  it("short numbers (counts, codes) stay readable", () => {
    expect(redact("3 seats on trip 42, status 500")).toBe("3 seats on trip 42, status 500");
  });

  it("reported errors are redacted before they reach monitoring", async () => {
    const fake = new FakeErrorReporter();
    setErrorReporterForTesting(fake);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await reportError("test.event", new Error("No ticket for +2348031234567"), { phone: "+2348031234567", trip: 7 });
    const e = fake.events[0]!;
    expect(JSON.stringify(e)).not.toContain("2348031234567");
    expect(e.tags).toMatchObject({ trip: "7" });
    setErrorReporterForTesting(undefined);
  });

  it("server code logs only through the redacting logger", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    walk("src/server");
    walk("src/app/api");
    const offenders = files.filter(
      (f) =>
        !f.endsWith("src/server/log.ts") &&
        !f.includes("integrations/messaging/fake.ts") && // prints the dev OTP (hashed phone) locally
        /console\.(log|error|warn|info)\(/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

describe("Sentry adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts an envelope to the project's endpoint with the public key, no user or IP", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = new SentryErrorReporter("https://abc123@o1.ingest.sentry.io/4507", "staging", "sha1");
    await r.capture({ event: "api.unhandled", error: { name: "Error", message: "boom" }, tags: { path: "/x" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o1.ingest.sentry.io/api/4507/envelope/");
    expect((init.headers as Record<string, string>)["x-sentry-auth"]).toContain("sentry_key=abc123");
    const event = JSON.parse(String(init.body).split("\n")[2]!);
    expect(event).toMatchObject({ environment: "staging", release: "sha1", transaction: "api.unhandled" });
    expect(event.user).toBeUndefined();
  });

  it("never throws when monitoring is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    const r = new SentryErrorReporter("https://k@sentry.example/1", "production");
    await expect(r.capture({ event: "x", error: { name: "E", message: "m" } })).resolves.toBeUndefined();
  });
});

describe("config", () => {
  it("every processor states purpose, data, location and status", () => {
    for (const p of PROCESSORS) expect(p.name && p.purpose && p.data && p.location && p.status).toBeTruthy();
    expect(PROCESSORS.map((p) => p.name)).toEqual(expect.arrayContaining(["Supabase", "Vercel", "Paystack", "Sentry"]));
  });
  it("limits are positive", () => {
    for (const [max, seconds] of Object.values(LIMITS)) {
      expect(max).toBeGreaterThan(0);
      expect(seconds).toBeGreaterThan(0);
    }
  });
});
