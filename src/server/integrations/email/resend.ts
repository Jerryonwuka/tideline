import type { EmailClient, EmailMessage } from "./types";

/** Resend (https://resend.com/docs/api-reference/emails/send-email). The sender domain is verified once in DNS. */
export class ResendEmailClient implements EmailClient {
  constructor(
    private readonly options: { apiKey: string; from: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage) {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.options.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content).toString("base64"),
                content_type: a.contentType,
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) return { id: "", status: "failed" as const };
    const json = (await res.json()) as { id: string };
    return { id: json.id, status: "accepted" as const };
  }
}
