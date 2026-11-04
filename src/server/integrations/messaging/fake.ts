import { hashPhone } from "@/server/privacy";
import type { MediaDownload, MessagingClient, OutboundMessage, SendResult } from "./types";

/**
 * Records every message in memory. In dev it prints OTP codes to the console so you can log in
 * without an SMS provider; the phone number is hashed, never printed.
 */
export class FakeMessagingClient implements MessagingClient {
  readonly sent: OutboundMessage[] = [];
  readonly otps: { toE164: string; code: string; locale: string }[] = [];
  private readonly media = new Map<string, MediaDownload>();
  private counter = 0;

  constructor(private readonly options: { printOtp?: boolean } = {}) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    this.sent.push(message);
    return { providerMessageId: this.nextId(message.channel), status: "accepted" };
  }

  async sendOtp(toE164: string, code: string, locale: string): Promise<SendResult> {
    this.otps.push({ toE164, code, locale });
    if (this.options.printOtp) {
      console.info(`[fake-messaging] OTP for phone#${hashPhone(toE164)}: ${code}`);
    }
    return { providerMessageId: this.nextId("sms"), status: "accepted" };
  }

  /** Test helper: make a media id downloadable. */
  putMedia(mediaId: string, media: MediaDownload): void {
    this.media.set(mediaId, media);
  }

  async downloadWhatsAppMedia(mediaId: string): Promise<MediaDownload> {
    const media = this.media.get(mediaId);
    if (!media) throw new Error(`Unknown fake media ${mediaId}`);
    return media;
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `fake-${prefix}-${this.counter}`;
  }
}
