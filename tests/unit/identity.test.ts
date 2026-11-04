import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, toE164 } from "@/lib/phone";
import { createOrgSchema } from "@/lib/schemas/orgs";
import { inviteSchema, updateMembershipSchema } from "@/lib/schemas/members";
import { postLoginPath, safeNext } from "@/server/auth/session";
import { fromDbError, ServiceError } from "@/server/services/errors";
import type { Me } from "@/server/services/profile";
import { signStandardWebhook, verifyStandardWebhook } from "@/server/webhooks/standard";

describe("phone numbers", () => {
  it("normalises local and international input to E.164", () => {
    expect(toE164("0803 123 4567", "NG")).toBe("+2348031234567");
    expect(toE164("+234 803 123 4567", "NG")).toBe("+2348031234567");
    expect(toE164("2348031234567", "NG")).toBe("+2348031234567");
    expect(toE164("024 412 3456", "GH")).toBe("+233244123456");
    expect(toE164("12345", "NG")).toBeNull();
    expect(toE164("", "NG")).toBeNull();
  });

  it("formats and masks for display", () => {
    expect(formatPhone("+2348031234567")).toBe("+234 803 123 4567");
    expect(maskPhone("+2348031234567")).toBe("+234 ••• ••• 4567");
  });
});

describe("standard webhooks (auth hook signatures)", () => {
  const secret = `v1,whsec_${Buffer.from("local-test-secret-32-bytes-long!!").toString("base64")}`;
  const body = JSON.stringify({ user: { phone: "2348031234567" }, sms: { otp: "123456" } });
  const now = new Date("2026-11-04T12:00:00Z");
  const ts = Math.floor(now.getTime() / 1000);

  it("accepts a correctly signed request", () => {
    expect(verifyStandardWebhook(secret, signStandardWebhook(secret, "msg_1", ts, body), body, now)).toBe(true);
  });

  it("rejects tampering, wrong secrets and stale timestamps", () => {
    const headers = signStandardWebhook(secret, "msg_1", ts, body);
    expect(verifyStandardWebhook(secret, headers, body.replace("123456", "000000"), now)).toBe(false);
    const other = `v1,whsec_${Buffer.from("another-secret-another-secret!!!").toString("base64")}`;
    expect(verifyStandardWebhook(other, headers, body, now)).toBe(false);
    expect(verifyStandardWebhook(secret, headers, body, new Date(now.getTime() + 10 * 60_000))).toBe(false);
    expect(verifyStandardWebhook(secret, new Headers(), body, now)).toBe(false);
  });
});

describe("post-login routing", () => {
  const base: Me = {
    userId: "u",
    phone: "+2348031234567",
    fullName: "Ada",
    locale: null,
    timeZone: null,
    isPlatformAdmin: false,
    memberships: [],
  };
  const member = { id: "m", orgId: "o", orgName: "Org", role: "owner" as const, status: "active" as const };

  it("only allows same-site relative paths", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });

  it("asks for a name first, then honours next, then picks onboarding or dashboard", () => {
    expect(postLoginPath({ ...base, fullName: null }, "/invite/x")).toBe("/onboarding/profile?next=%2Finvite%2Fx");
    expect(postLoginPath(base, "/invite/x")).toBe("/invite/x");
    expect(postLoginPath(base, null)).toBe("/onboarding");
    expect(postLoginPath({ ...base, memberships: [member] }, null)).toBe("/dashboard");
  });
});

describe("validation and errors", () => {
  it("validates org creation input", () => {
    expect(
      createOrgSchema.safeParse({ name: "Lagoon Ferries", type: "ferry_operator", countryCode: "NG", modes: ["ferry"] })
        .success,
    ).toBe(true);
    expect(
      createOrgSchema.safeParse({ name: "L", type: "ferry_operator", countryCode: "NG", modes: ["ferry"] }).success,
    ).toBe(false);
    expect(
      createOrgSchema.safeParse({ name: "Lagoon", type: "ferry_operator", countryCode: "NG", modes: [] }).success,
    ).toBe(false);
  });

  it("does not let anyone be invited as a charterer, and requires a change", () => {
    expect(inviteSchema.safeParse({ phone: "08031234567", role: "charterer" }).success).toBe(false);
    expect(updateMembershipSchema.safeParse({}).success).toBe(false);
    expect(updateMembershipSchema.safeParse({ role: "crew" }).success).toBe(true);
  });

  it("maps database errors to stable codes and HTTP statuses", () => {
    expect(fromDbError({ code: "P0001", message: "last_owner" })).toMatchObject({ code: "last_owner", status: 409 });
    expect(fromDbError({ code: "42501", message: "new row violates row-level security policy" }).code).toBe(
      "forbidden",
    );
    expect(fromDbError({ code: "XX000", message: "boom" }).code).toBe("unknown");
    expect(new ServiceError("invitation_expired").status).toBe(410);
  });
});
