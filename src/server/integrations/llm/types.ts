import type { z } from "zod";

export interface LlmImage {
  mimeType: string;
  /** Base64-encoded bytes. */
  data: string;
}

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
  images?: LlmImage[];
}

export interface LlmUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface StructuredRequest<T extends z.ZodType> {
  /** Used for ai_jobs.prompt_version and for routing fake responses in tests. */
  promptId: string;
  promptVersion: string;
  system: string;
  messages: LlmMessage[];
  schema: T;
  /** JSON schema name shown to the model. */
  schemaName: string;
  maxTokens?: number;
}

export interface StructuredResult {
  /** Unvalidated output; callers validate with the schema (and retry once on failure, §10). */
  raw: unknown;
  usage: LlmUsage;
}

export interface LlmTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "done"; usage: LlmUsage };

export interface ChatRequest {
  promptId: string;
  promptVersion: string;
  system: string;
  messages: (LlmMessage | { role: "tool"; toolCallId: string; content: string })[];
  tools: LlmTool[];
  maxTokens?: number;
}

export interface LlmClient {
  /** One-shot call returning JSON shaped by `schema`. */
  generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResult>;
  /** Plain text completion (short explanations, rationales). */
  generateText(
    req: Omit<StructuredRequest<z.ZodType>, "schema" | "schemaName">,
  ): Promise<{ text: string; usage: LlmUsage }>;
  /** Streamed, tool-calling chat for the assistant. */
  chat(req: ChatRequest): AsyncIterable<ChatEvent>;
}
