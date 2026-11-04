import { createHash } from "node:crypto";
import type { OcrClient, OcrPage, OcrResult } from "./types";

/** Returns text registered for each page's bytes; unknown pages come back empty. */
export class FakeOcrClient implements OcrClient {
  private readonly texts = new Map<string, string>();

  register(bytes: Uint8Array, text: string): this {
    this.texts.set(digest(bytes), text);
    return this;
  }

  async extractText(pages: OcrPage[]): Promise<OcrResult> {
    return {
      pages: pages.map((p) => ({ text: this.texts.get(digest(p.bytes)) ?? "", confidence: 1 })),
      model: "fake-ocr",
    };
  }
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
