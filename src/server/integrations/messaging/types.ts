/** Outbound WhatsApp + SMS. Provider (WhatsApp Cloud API, Termii, ...) is chosen per country. */

export interface WhatsAppButton {
  id: string;
  title: string;
}

export type OutboundMessage =
  | { channel: "whatsapp"; kind: "text"; toE164: string; text: string }
  | {
      channel: "whatsapp";
      kind: "template";
      toE164: string;
      template: string;
      locale: string;
      params: string[];
    }
  | {
      channel: "whatsapp";
      kind: "interactive";
      toE164: string;
      body: string;
      buttons: WhatsAppButton[];
    }
  | { channel: "sms"; kind: "text"; toE164: string; text: string };

export interface SendResult {
  /** Provider message id (wa_message_id for WhatsApp). */
  providerMessageId: string;
  status: "accepted" | "failed";
  error?: string;
}

export interface MediaDownload {
  bytes: Uint8Array;
  mimeType: string;
}

export interface MessagingClient {
  send(message: OutboundMessage): Promise<SendResult>;
  /** Sends a one-time passcode by SMS (or WhatsApp where the country config says so). */
  sendOtp(toE164: string, code: string, locale: string): Promise<SendResult>;
  downloadWhatsAppMedia(mediaId: string): Promise<MediaDownload>;
}
