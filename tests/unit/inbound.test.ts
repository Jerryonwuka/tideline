import { describe, expect, it } from "vitest";
import {
  InboundSignatureError,
  parseSmsPayload,
  parseWhatsAppPayload,
  signWhatsApp,
  verifyWhatsAppSignature,
  whatsAppChallenge,
} from "@/server/integrations/messaging/inbound";

// Meta WhatsApp Cloud API webhook shapes (trimmed from the docs).
const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              {
                from: "2348030000002",
                id: "wamid.1",
                timestamp: "1793800000",
                type: "text",
                text: { body: "Fuel 40k" },
              },
              {
                from: "2348030000002",
                id: "wamid.2",
                timestamp: "1793800001",
                type: "audio",
                audio: { id: "media-1", mime_type: "audio/ogg; codecs=opus" },
              },
              {
                from: "2348030000002",
                id: "wamid.3",
                timestamp: "1793800002",
                type: "image",
                image: { id: "media-2", mime_type: "image/jpeg", caption: "licence" },
              },
              {
                from: "2348030000001",
                id: "wamid.4",
                timestamp: "1793800003",
                type: "interactive",
                interactive: { type: "button_reply", button_reply: { id: "bot:confirm:abc", title: "Confirm" } },
              },
            ],
          },
        },
        { value: { statuses: [{ id: "wamid.out", status: "delivered" }] } },
      ],
    },
  ],
};

describe("WhatsApp inbound", () => {
  it("normalises text, voice, photo and button messages; ignores status updates", () => {
    const msgs = parseWhatsAppPayload(payload);
    expect(msgs.map((m) => [m.providerId, m.type])).toEqual([
      ["wamid.1", "text"],
      ["wamid.2", "audio"],
      ["wamid.3", "image"],
      ["wamid.4", "button"],
    ]);
    expect(msgs[0]).toMatchObject({ fromE164: "+2348030000002", text: "Fuel 40k" });
    expect(msgs[1]).toMatchObject({ mediaId: "media-1", mimeType: "audio/ogg; codecs=opus" });
    expect(msgs[3]).toMatchObject({ buttonId: "bot:confirm:abc" });
  });

  it("checks X-Hub-Signature-256 against the raw body", () => {
    const raw = JSON.stringify(payload);
    expect(() => verifyWhatsAppSignature(raw, signWhatsApp(raw, "secret"), "secret")).not.toThrow();
    expect(() => verifyWhatsAppSignature(raw, signWhatsApp(raw, "other"), "secret")).toThrow(InboundSignatureError);
    expect(() => verifyWhatsAppSignature(`${raw} `, signWhatsApp(raw, "secret"), "secret")).toThrow(
      InboundSignatureError,
    );
    expect(() => verifyWhatsAppSignature(raw, null, "secret")).toThrow(InboundSignatureError);
  });

  it("answers the subscription handshake only with the right token", () => {
    const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "42" });
    expect(whatsAppChallenge(ok, "tok")).toBe("42");
    expect(whatsAppChallenge(ok, "nope")).toBeNull();
  });
});

describe("SMS inbound", () => {
  it("needs the shared token and normalises the sender", () => {
    const body = { id: "sms-1", sender: "2348030000002", message: "TRIP 4 CMS IKD 18 27000" };
    expect(parseSmsPayload(body, new URLSearchParams({ token: "t" }), "t")).toMatchObject({
      channel: "sms",
      providerId: "sms-1",
      fromE164: "+2348030000002",
      text: "TRIP 4 CMS IKD 18 27000",
    });
    expect(() => parseSmsPayload(body, new URLSearchParams({ token: "x" }), "t")).toThrow(InboundSignatureError);
  });
});
