import type { EmailClient, EmailMessage } from "./types";

/** Records every email in memory (local dev and tests). */
export class FakeEmailClient implements EmailClient {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
    return { id: `fake-email-${this.sent.length}`, status: "accepted" as const };
  }
}
