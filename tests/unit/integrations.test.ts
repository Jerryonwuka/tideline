import { describe, expect, it } from "vitest";
import { z } from "zod";
import { money } from "@/lib/money";
import { FakeLlmClient } from "@/server/integrations/llm/fake";
import { FakeMessagingClient } from "@/server/integrations/messaging/fake";
import { FakePaymentProvider } from "@/server/integrations/payments/fake";
import { NoPaymentRouteError, PaymentRouter, type PaymentRoute } from "@/server/integrations/payments/router";
import { WebhookSignatureError, type PaymentProvider } from "@/server/integrations/payments/types";
import { FakeSttClient } from "@/server/integrations/stt/fake";
import { FakeWeatherClient } from "@/server/integrations/weather/fake";

/** A fake that reports itself under another provider id, to test routing by config. */
function fakeAs(id: "paystack" | "flutterwave"): PaymentProvider {
  const fake = new FakePaymentProvider();
  return Object.assign(Object.create(Object.getPrototypeOf(fake)), fake, { id });
}

const routes: PaymentRoute[] = [
  { countryCode: "NG", currency: "NGN", purpose: "ticket", provider: "flutterwave", priority: 2, enabled: true },
  { countryCode: "NG", currency: "NGN", purpose: "ticket", provider: "paystack", priority: 1, enabled: true },
];

describe("PaymentRouter", () => {
  it("picks the highest-priority enabled route", () => {
    const router = new PaymentRouter(routes, [fakeAs("paystack"), fakeAs("flutterwave")]);
    expect(router.pick("NG", "NGN", "ticket").id).toBe("paystack");
  });

  it("falls back when the first route is disabled", () => {
    const disabled = routes.map((r) => (r.provider === "paystack" ? { ...r, enabled: false } : r));
    const router = new PaymentRouter(disabled, [fakeAs("paystack"), fakeAs("flutterwave")]);
    expect(router.pick("NG", "NGN", "ticket").id).toBe("flutterwave");
  });

  it("throws when nothing is configured", () => {
    const router = new PaymentRouter(routes, [fakeAs("paystack")]);
    expect(() => router.pick("ZZ", "USD", "ticket")).toThrow(NoPaymentRouteError);
  });
});

describe("FakePaymentProvider", () => {
  it("accepts a signed webhook and rejects a tampered one", async () => {
    const provider = new FakePaymentProvider();
    const input = FakePaymentProvider.signedWebhook({
      id: "evt_1",
      event: "charge.success",
      reference: "ref_1",
      amount_minor: "150000",
      currency: "NGN",
    });
    const event = await provider.parseWebhook(input);
    expect(event).toMatchObject({ kind: "charge.success", eventId: "evt_1", amount: money(150_000, "NGN") });

    const tampered = { ...input, rawBody: input.rawBody.replace("150000", "999999") };
    await expect(provider.parseWebhook(tampered)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("tracks checkout → verify", async () => {
    const provider = new FakePaymentProvider();
    await provider.initCheckout({
      reference: "ref_2",
      amount: money(10_000, "USD"),
      purpose: "subscription",
      customer: { email: "owner@example.com" },
      callbackUrl: "http://localhost:3000/billing",
    });
    expect((await provider.verify("ref_2")).status).toBe("initiated");
    provider.completeCharge("ref_2");
    expect((await provider.verify("ref_2")).status).toBe("success");
  });
});

describe("other fakes", () => {
  it("messaging records messages and OTPs", async () => {
    const messaging = new FakeMessagingClient();
    await messaging.send({ channel: "sms", kind: "text", toE164: "+2348000000000", text: "hi" });
    await messaging.sendOtp("+2348000000000", "123456", "en-NG");
    expect(messaging.sent).toHaveLength(1);
    expect(messaging.otps[0]?.code).toBe("123456");
  });

  it("llm returns scripted output and refuses unknown prompts", async () => {
    const llm = new FakeLlmClient().respond("voice_log", { kind: "trip_log" });
    const req = {
      promptVersion: "1",
      system: "s",
      messages: [{ role: "user" as const, content: "Trip four" }],
      schema: z.object({ kind: z.string() }),
      schemaName: "log",
    };
    expect((await llm.generateStructured({ ...req, promptId: "voice_log" })).raw).toEqual({ kind: "trip_log" });
    await expect(llm.generateStructured({ ...req, promptId: "other" })).rejects.toThrow();
    expect(llm.calls[0]?.lastUserMessage).toBe("Trip four");
  });

  it("stt matches audio bytes", async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const stt = new FakeSttClient().register(audio, "Trip four CMS to Ikorodu");
    const result = await stt.transcribe({ audio, mimeType: "audio/ogg", languageHints: ["en-NG"] });
    expect(result.text).toBe("Trip four CMS to Ikorodu");
  });

  it("weather covers the window hourly", async () => {
    const weather = new FakeWeatherClient({ gustKmh: 45 });
    const forecast = await weather.getForecast({
      lat: 6.45,
      lng: 3.4,
      from: new Date("2026-11-04T16:30:00Z"),
      to: new Date("2026-11-04T18:00:00Z"),
    });
    expect(forecast.points.map((p) => p.time.toISOString())).toEqual([
      "2026-11-04T16:00:00.000Z",
      "2026-11-04T17:00:00.000Z",
      "2026-11-04T18:00:00.000Z",
    ]);
    expect(forecast.points.every((p) => p.gustKmh === 45)).toBe(true);
  });
});
