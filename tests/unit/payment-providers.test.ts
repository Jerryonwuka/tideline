import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { FlutterwaveProvider } from "@/server/integrations/payments/flutterwave";
import { PaystackProvider } from "@/server/integrations/payments/paystack";
import { WebhookSignatureError } from "@/server/integrations/payments/types";

// Request and webhook shapes as documented by each provider (trimmed). No network.

function recorder(responses: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(responses).find((k) => url.includes(k));
    return new Response(JSON.stringify(key ? responses[key] : {}), { status: key ? 200 : 404 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("Paystack", () => {
  const secret = "sk_test_123";

  it("starts checkout in kobo with our reference and a subaccount split", async () => {
    const { calls, fetchImpl } = recorder({
      "/transaction/initialize": {
        status: true,
        message: "ok",
        data: { authorization_url: "https://checkout.paystack.com/x", reference: "TKT-1" },
      },
    });
    const session = await new PaystackProvider(secret, fetchImpl).initCheckout({
      reference: "TKT-1",
      amount: money(307500, "NGN"),
      purpose: "ticket",
      customer: { phoneE164: "+2348030000001" },
      callbackUrl: "https://app.example/tickets/ABCD2345",
      splitSubaccountCode: "ACCT_op",
      platformFee: money(7500, "NGN"),
    });
    expect(session.checkoutUrl).toBe("https://checkout.paystack.com/x");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body).toMatchObject({
      amount: "307500",
      currency: "NGN",
      reference: "TKT-1",
      subaccount: "ACCT_op",
      transaction_charge: "7500",
    });
    expect(body.email).toMatch(/@payments\.tideline\.invalid$/);
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe(`Bearer ${secret}`);
  });

  it("verifies a transaction", async () => {
    const { fetchImpl } = recorder({
      "/transaction/verify/TKT-1": {
        status: true,
        message: "ok",
        data: {
          status: "success",
          reference: "TKT-1",
          amount: 307500,
          currency: "NGN",
          fees: 4612,
          paid_at: "2026-11-04T10:00:00Z",
        },
      },
    });
    const v = await new PaystackProvider(secret, fetchImpl).verify("TKT-1");
    expect(v).toMatchObject({ status: "success", amount: money(307500, "NGN"), providerFee: money(4612, "NGN") });
  });

  it("checks the webhook signature and normalises charge.success", async () => {
    const rawBody = JSON.stringify({
      event: "charge.success",
      data: {
        id: 99,
        reference: "TKT-1",
        amount: 307500,
        currency: "NGN",
        fees: 4612,
        paid_at: "2026-11-04T10:00:00Z",
      },
    });
    const sig = createHmac("sha512", secret).update(rawBody).digest("hex");
    const p = new PaystackProvider(secret);
    const event = await p.parseWebhook({ rawBody, headers: new Headers({ "x-paystack-signature": sig }) });
    expect(event).toMatchObject({
      kind: "charge.success",
      eventId: "charge.success:99",
      reference: "TKT-1",
      amount: money(307500, "NGN"),
    });
    await expect(
      p.parseWebhook({ rawBody, headers: new Headers({ "x-paystack-signature": "0".repeat(128) }) }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(
      p.parseWebhook({
        rawBody: rawBody.replace("307500", "1"),
        headers: new Headers({ "x-paystack-signature": sig }),
      }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});

describe("Flutterwave", () => {
  it("sends major units and returns the hosted link", async () => {
    const { calls, fetchImpl } = recorder({
      "/payments": { status: "success", message: "ok", data: { link: "https://checkout.flutterwave.com/x" } },
    });
    const session = await new FlutterwaveProvider("FLWSECK_TEST", "hash", fetchImpl).initCheckout({
      reference: "TKT-2",
      amount: money(307550, "NGN"),
      purpose: "ticket",
      customer: { name: "Ada" },
      callbackUrl: "https://app.example/tickets/ABCD2345",
    });
    expect(session.checkoutUrl).toBe("https://checkout.flutterwave.com/x");
    expect(JSON.parse(String(calls[0]!.init!.body))).toMatchObject({
      tx_ref: "TKT-2",
      amount: "3075.50",
      currency: "NGN",
    });
  });

  it("verifies by reference into minor units", async () => {
    const { fetchImpl } = recorder({
      verify_by_reference: {
        status: "success",
        message: "ok",
        data: { id: 5, status: "successful", tx_ref: "TKT-2", amount: 3075.5, currency: "NGN", app_fee: 43.06 },
      },
    });
    const v = await new FlutterwaveProvider("k", "hash", fetchImpl).verify("TKT-2");
    expect(v).toMatchObject({ status: "success", amount: money(307550, "NGN"), providerFee: money(4306, "NGN") });
  });

  it("accepts only the configured webhook hash", async () => {
    const rawBody = JSON.stringify({
      event: "charge.completed",
      data: { id: 7, tx_ref: "TKT-2", amount: 3075.5, currency: "NGN", status: "successful" },
    });
    const p = new FlutterwaveProvider("k", "my-hash");
    await expect(p.parseWebhook({ rawBody, headers: new Headers({ "verif-hash": "my-hash" }) })).resolves.toMatchObject(
      {
        kind: "charge.success",
        reference: "TKT-2",
        amount: money(307550, "NGN"),
      },
    );
    await expect(p.parseWebhook({ rawBody, headers: new Headers({ "verif-hash": "nope" }) })).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });
});
