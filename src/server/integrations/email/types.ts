/** Outbound email (invoices, receipts). Provider chosen later; a fake records messages meanwhile. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; contentType: string; content: Uint8Array }[];
}

export interface EmailClient {
  send(message: EmailMessage): Promise<{ id: string; status: "accepted" | "failed" }>;
}
