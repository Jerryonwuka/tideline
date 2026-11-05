import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type {
  ChatEvent,
  ChatRequest,
  LlmClient,
  LlmMessage,
  LlmUsage,
  StructuredRequest,
  StructuredResult,
} from "./types";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type ToolParam = Anthropic.Beta.Messages.BetaTool;
type Message = Anthropic.Beta.Messages.BetaMessage;

/** Images Claude reads directly; anything else (HEIC, TIFF) is skipped and the caller falls back. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface AnthropicLlmOptions {
  apiKey: string;
  model: string;
  /** Re-run a declined request on another model server-side (Claude API only). */
  fallbacks: boolean;
}

/** Thrown when the model declines; callers treat it like any failed AI job (manual entry). */
export class LlmRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`model declined${category ? ` (${category})` : ""}`);
  }
}

/**
 * Claude via the Anthropic API. Structured jobs use JSON-schema output; the assistant streams with
 * tools. Thinking is adaptive (the model decides); its blocks are passed back in tool loops via
 * `raw`. No personal data is logged here.
 */
export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(
    private readonly options: AnthropicLlmOptions,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 2 });
  }

  private get fallback() {
    return this.options.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};
  }

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResult> {
    const started = Date.now();
    const base = {
      model: this.options.model,
      max_tokens: Math.max(req.maxTokens ?? 0, 16000),
      system: req.system,
      messages: req.messages.map(toParam),
      ...this.fallback,
    };
    let res: Message;
    try {
      const { type, schema } = betaZodOutputFormat(req.schema);
      res = await this.client.beta.messages.create({ ...base, output_config: { format: { type, schema } } });
    } catch (err) {
      // A schema the structured-output grammar can't express: ask for JSON in words instead. The
      // caller validates with Zod and retries once either way (§10).
      if (!(err instanceof Anthropic.BadRequestError) && !isSchemaConversionError(err)) throw err;
      const jsonSchema = JSON.stringify(z.toJSONSchema(req.schema, { io: "input", unrepresentable: "any" }));
      res = await this.client.beta.messages.create({
        ...base,
        system: `${req.system}\n\nReply with one JSON object only, no other text, matching this JSON schema:\n${jsonSchema}`,
      });
    }
    checkRefusal(res);
    return { raw: parseJson(textOf(res)), usage: usageOf(res, started) };
  }

  async generateText(req: Omit<StructuredRequest<z.ZodType>, "schema" | "schemaName">) {
    const started = Date.now();
    const res = await this.client.beta.messages.create({
      model: this.options.model,
      max_tokens: Math.max(req.maxTokens ?? 0, 16000),
      system: req.system,
      messages: req.messages.map(toParam),
      ...this.fallback,
    });
    checkRefusal(res);
    return { text: textOf(res), usage: usageOf(res, started) };
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatEvent> {
    const started = Date.now();
    const stream = this.client.beta.messages.stream({
      model: this.options.model,
      max_tokens: 32000,
      // Stable prefix (tools, then system) is cached across turns of the same conversation.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: chatMessages(req.messages),
      tools: req.tools.map(toTool),
      output_config: { effort: "medium" },
      ...this.fallback,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    checkRefusal(final);
    for (const block of final.content) {
      if (block.type === "tool_use") yield { type: "tool_call", id: block.id, name: block.name, input: block.input };
    }
    yield { type: "done", usage: usageOf(final, started), raw: final.content };
  }
}

function toParam(m: LlmMessage): MessageParam {
  if (m.role === "assistant") {
    return { role: "assistant", content: (m.raw as ContentBlockParam[] | undefined) ?? m.content };
  }
  const images: ContentBlockParam[] = (m.images ?? [])
    .filter((i) => IMAGE_TYPES.has(i.mimeType))
    .map((i) => ({ type: "image", source: { type: "base64", media_type: i.mimeType as ImageType, data: i.data } }));
  if (!images.length) return { role: "user", content: m.content };
  return { role: "user", content: [...images, { type: "text", text: m.content }] };
}

/** Tool results from one round go back together in a single user message. */
export function chatMessages(messages: ChatRequest["messages"]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of messages) {
    if (m.role !== "tool") {
      out.push(toParam(m));
      continue;
    }
    const block: ContentBlockParam = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
    const last = out[out.length - 1];
    if (last?.role === "user" && Array.isArray(last.content) && last.content.every((b) => b.type === "tool_result")) {
      last.content.push(block);
    } else {
      out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

export function toTool(t: ChatRequest["tools"][number]): ToolParam {
  const schema = z.toJSONSchema(t.inputSchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = schema;
  return {
    name: t.name,
    description: t.description,
    input_schema: { ...rest, type: "object" } as ToolParam["input_schema"],
  };
}

function textOf(res: Message): string {
  return res.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function parseJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Callers validate with Zod; invalid output is treated like any schema failure and retried once.
    return text;
  }
}

function checkRefusal(res: Message): void {
  if (res.stop_reason === "refusal") throw new LlmRefusalError(res.stop_details?.category ?? null);
}

function usageOf(res: Message, started: number): LlmUsage {
  const u = res.usage;
  return {
    model: res.model,
    tokensIn: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    tokensOut: u.output_tokens,
    latencyMs: Date.now() - started,
  };
}

function isSchemaConversionError(err: unknown): boolean {
  return err instanceof Error && !(err instanceof Anthropic.APIError);
}
