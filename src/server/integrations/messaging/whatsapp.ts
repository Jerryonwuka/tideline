import type { MediaDownload, OutboundMessage, SendResult } from "./types";

export interface WhatsAppOptions {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}

type WhatsAppMessage = Extract<OutboundMessage, { channel: "whatsapp" }>;

/** Meta error codes where SMS should be tried instead (no 24-hour window, not on WhatsApp). */
export const SMS_FALLBACK_CODES = new Set([131047, 131026, 131049]);

/** WhatsApp Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api). */
export class WhatsAppCloud {
  constructor(
    private readonly options: WhatsAppOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get base() {
    return `https://graph.facebook.com/${this.options.apiVersion}`;
  }

  async send(message: WhatsAppMessage): Promise<SendResult & { errorCode?: number }> {
    try {
      const res = await this.fetchImpl(`${this.base}/${this.options.phoneNumberId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.options.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: message.toE164.replace(/^\+/, ""),
          ...payload(message),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { code?: number };
      };
      const id = json.messages?.[0]?.id;
      if (!res.ok || !id) {
        const code = json.error?.code;
        return {
          providerMessageId: "",
          status: "failed",
          error: `whatsapp ${res.status}${code ? ` (${code})` : ""}`,
          ...(code !== undefined ? { errorCode: code } : {}),
        };
      }
      return { providerMessageId: id, status: "accepted" };
    } catch {
      return { providerMessageId: "", status: "failed", error: "whatsapp unreachable" };
    }
  }

  async downloadMedia(mediaId: string): Promise<MediaDownload> {
    const auth = { authorization: `Bearer ${this.options.accessToken}` };
    const meta = await this.fetchImpl(`${this.base}/${encodeURIComponent(mediaId)}`, { headers: auth });
    if (!meta.ok) throw new Error(`whatsapp media ${meta.status}`);
    const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
    const file = await this.fetchImpl(url, { headers: auth });
    if (!file.ok) throw new Error(`whatsapp media download ${file.status}`);
    return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: mime_type };
  }
}

/** Meta language codes are "en", "fr", "pt_BR"; our locales are BCP 47 ("en-NG"). */
export function templateLanguage(locale: string): string {
  const [lang, region] = locale.split("-");
  return lang === "pt" && region === "BR" ? "pt_BR" : (lang ?? "en");
}

function payload(m: WhatsAppMessage): Record<string, unknown> {
  switch (m.kind) {
    case "text":
      return { type: "text", text: { preview_url: true, body: m.text } };
    case "template":
      return {
        type: "template",
        template: {
          name: m.template,
          language: { code: templateLanguage(m.locale) },
          components: m.params.length
            ? [{ type: "body", parameters: m.params.map((text) => ({ type: "text", text })) }]
            : [],
        },
      };
    case "interactive":
      return {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: m.body },
          // Meta allows three reply buttons with titles up to 20 characters.
          action: {
            buttons: m.buttons
              .slice(0, 3)
              .map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })),
          },
        },
      };
  }
}
