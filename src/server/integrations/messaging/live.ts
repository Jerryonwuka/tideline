import type { MediaDownload, MessagingClient, OutboundMessage, SendResult } from "./types";
import type { TermiiSms } from "./termii";
import { SMS_FALLBACK_CODES, type WhatsAppCloud } from "./whatsapp";

/**
 * WhatsApp first, SMS when WhatsApp can't deliver free text (outside the 24-hour window, or the
 * number isn't on WhatsApp) or isn't set up yet. Templates are not converted here: callers already
 * send their own SMS wording when a template fails.
 */
export class LiveMessagingClient implements MessagingClient {
  constructor(
    private readonly sms: TermiiSms,
    private readonly whatsapp: WhatsAppCloud | null,
    private readonly otpText: (code: string, locale: string) => Promise<string>,
  ) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    if (message.channel === "sms") return this.sms.send(message.toE164, message.text, "generic");
    const asSms = message.kind === "text" ? message.text : message.kind === "interactive" ? message.body : null;
    if (!this.whatsapp) {
      return asSms === null
        ? { providerMessageId: "", status: "failed", error: "whatsapp not configured" }
        : this.sms.send(message.toE164, asSms, "generic");
    }
    const result = await this.whatsapp.send(message);
    if (result.status === "accepted" || asSms === null) return result;
    if (result.errorCode !== undefined && SMS_FALLBACK_CODES.has(result.errorCode)) {
      return this.sms.send(message.toE164, asSms, "generic");
    }
    return result;
  }

  async sendOtp(toE164: string, code: string, locale: string): Promise<SendResult> {
    return this.sms.send(toE164, await this.otpText(code, locale), "dnd");
  }

  async downloadWhatsAppMedia(mediaId: string): Promise<MediaDownload> {
    if (!this.whatsapp) throw new Error("whatsapp not configured");
    return this.whatsapp.downloadMedia(mediaId);
  }
}
