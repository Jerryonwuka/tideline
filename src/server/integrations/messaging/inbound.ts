import { createHmac, timingSafeEqual } from "node:crypto";

// Inbound messages from WhatsApp Cloud API (Meta) and the SMS gateway (Termii), normalised into one
// shape. Vendor payload formats and signature checks live here, not in business code.

export interface InboundMessage {
  channel: "whatsapp" | "sms";
  /** Provider message id (wa_message_id); each is handled once. */
  providerId: string;
  /** Sender in E.164. Never logged. */
  fromE164: string;
  at: Date;
  type: "text" | "audio" | "image" | "document" | "button" | "other";
  text?: string;
  mediaId?: string;
  mimeType?: string;
  /** For interactive button replies. */
  buttonId?: string;
}

export class InboundSignatureError extends Error {
  constructor() {
    super("Invalid inbound message signature");
    this.name = "InboundSignatureError";
  }
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Meta's webhook verification handshake: echo hub.challenge when the token matches. */
export function whatsAppChallenge(params: URLSearchParams, verifyToken: string): string | null {
  return params.get("hub.mode") === "subscribe" && safeEqual(params.get("hub.verify_token") ?? "", verifyToken)
    ? params.get("hub.challenge")
    : null;
}

/** X-Hub-Signature-256: sha256=HMAC-SHA256(raw body, app secret). */
export function verifyWhatsAppSignature(rawBody: string, header: string | null, appSecret: string): void {
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  if (!appSecret || !header || !safeEqual(header, expected)) throw new InboundSignatureError();
}

export function signWhatsApp(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type: string };
  voice?: { id: string; mime_type: string };
  image?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; caption?: string };
  interactive?: { type: string; button_reply?: { id: string; title: string } };
  button?: { payload: string; text: string };
}

/** Messages in a Meta webhook body (status callbacks and other changes are ignored). */
export function parseWhatsAppPayload(body: unknown): InboundMessage[] {
  const entries = (body as { entry?: { changes?: { value?: { messages?: MetaMessage[] } }[] }[] })?.entry ?? [];
  return entries.flatMap((e) =>
    (e.changes ?? []).flatMap((c) =>
      (c.value?.messages ?? []).map((m): InboundMessage => {
        const base = {
          channel: "whatsapp" as const,
          providerId: m.id,
          fromE164: m.from.startsWith("+") ? m.from : `+${m.from}`,
          at: new Date(Number(m.timestamp) * 1000),
        };
        const media = m.audio ?? m.voice ?? m.image ?? m.document;
        switch (m.type) {
          case "text":
            return { ...base, type: "text", text: m.text?.body ?? "" };
          case "audio":
          case "voice":
            return { ...base, type: "audio", mediaId: media?.id, mimeType: media?.mime_type };
          case "image":
          case "document":
            return {
              ...base,
              type: m.type,
              mediaId: media?.id,
              mimeType: media?.mime_type,
              text: m.image?.caption ?? m.document?.caption,
            };
          case "interactive":
            return {
              ...base,
              type: "button",
              buttonId: m.interactive?.button_reply?.id,
              text: m.interactive?.button_reply?.title,
            };
          case "button":
            return { ...base, type: "button", buttonId: m.button?.payload, text: m.button?.text };
          default:
            return { ...base, type: "other" };
        }
      }),
    ),
  );
}

/**
 * Termii inbound SMS (forwarded to our URL with a shared token in the query string, since the
 * gateway doesn't sign requests).
 */
export function parseSmsPayload(body: unknown, params: URLSearchParams, token: string): InboundMessage {
  if (!token || !safeEqual(params.get("token") ?? "", token)) throw new InboundSignatureError();
  const b = body as {
    id?: string;
    message_id?: string;
    sender?: string;
    from?: string;
    message?: string;
    sms?: string;
  };
  const from = b.sender ?? b.from ?? "";
  return {
    channel: "sms",
    providerId: String(b.id ?? b.message_id ?? ""),
    fromE164: from.startsWith("+") ? from : `+${from}`,
    at: new Date(),
    type: "text",
    text: b.message ?? b.sms ?? "",
  };
}
