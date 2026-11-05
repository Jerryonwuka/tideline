import type { SendResult } from "./types";

export interface TermiiOptions {
  apiKey: string;
  senderId: string;
  baseUrl: string;
}

/**
 * Termii SMS (https://developers.termii.com/messaging-api). Sign-in codes go on the "dnd" route,
 * which reaches numbers on Do-Not-Disturb in Nigeria; other messages use "generic".
 */
export class TermiiSms {
  constructor(
    private readonly options: TermiiOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(toE164: string, text: string, route: "dnd" | "generic"): Promise<SendResult> {
    try {
      const res = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, "")}/api/sms/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: this.options.apiKey,
          to: toE164.replace(/^\+/, ""),
          from: this.options.senderId,
          sms: text,
          type: "plain",
          channel: route,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { message_id?: string; message?: string };
      if (!res.ok || !json.message_id) {
        return { providerMessageId: "", status: "failed", error: `termii ${res.status}` };
      }
      return { providerMessageId: json.message_id, status: "accepted" };
    } catch {
      return { providerMessageId: "", status: "failed", error: "termii unreachable" };
    }
  }
}
