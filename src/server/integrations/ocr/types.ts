export interface OcrPage {
  mimeType: string;
  bytes: Uint8Array;
}

export interface OcrResult {
  pages: { text: string; confidence?: number }[];
  model: string;
}

/**
 * Plain text extraction from document photos/PDF pages. Structured field extraction (§10.1)
 * happens in the AI layer on top of this or directly through a vision-capable LlmClient.
 */
export interface OcrClient {
  extractText(pages: OcrPage[]): Promise<OcrResult>;
}
