import Anthropic from "@anthropic-ai/sdk";
import type { OcrClient, OcrPage, OcrResult } from "./types";

type Block = Anthropic.Beta.Messages.BetaContentBlockParam;
type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const IMAGE_TYPES = new Set<string>(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const SYSTEM =
  "You transcribe documents. Return all readable text exactly as written, line by line, keeping numbers, " +
  "dates and reference codes unchanged. Do not summarise, translate or add anything. If nothing is " +
  "readable, return an empty reply.";

/**
 * Plain-text OCR through Claude's vision (photos) and PDF reading. One request per page so the
 * result keeps the page order. Unsupported formats come back empty and the user types the fields.
 */
export class AnthropicOcrClient implements OcrClient {
  private readonly client: Anthropic;

  constructor(
    private readonly options: { apiKey: string; model: string },
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 2 });
  }

  async extractText(pages: OcrPage[]): Promise<OcrResult> {
    const out: { text: string }[] = [];
    for (const page of pages) {
      const block = toBlock(page);
      if (!block) {
        out.push({ text: "" });
        continue;
      }
      const res = await this.client.beta.messages.create({
        model: this.options.model,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: [block, { type: "text", text: "Transcribe this document." }] }],
      });
      if (res.stop_reason === "refusal") {
        out.push({ text: "" });
        continue;
      }
      out.push({
        text: res.content
          .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join(""),
      });
    }
    return { pages: out, model: this.options.model };
  }
}

function toBlock(page: OcrPage): Block | null {
  const data = Buffer.from(page.bytes).toString("base64");
  if (page.mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  if (IMAGE_TYPES.has(page.mimeType)) {
    return { type: "image", source: { type: "base64", media_type: page.mimeType as ImageType, data } };
  }
  return null;
}
