import type { z } from "zod";
import type { ChatEvent, ChatRequest, LlmClient, LlmUsage, StructuredRequest, StructuredResult } from "./types";

type Responder = (req: { promptId: string; system: string; lastUserMessage: string }) => unknown;

/**
 * Scripted LLM. Register a responder (or a fixed value) per promptId; each call records its request.
 * Unregistered prompts throw so tests never silently pass on empty output.
 */
export class FakeLlmClient implements LlmClient {
  readonly calls: { promptId: string; system: string; lastUserMessage: string }[] = [];
  private readonly responders = new Map<string, Responder>();
  private readonly chatScripts = new Map<string, ChatEvent[]>();

  respond(promptId: string, output: unknown | Responder): this {
    this.responders.set(promptId, typeof output === "function" ? (output as Responder) : () => output);
    return this;
  }

  scriptChat(promptId: string, events: ChatEvent[]): this {
    this.chatScripts.set(promptId, events);
    return this;
  }

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResult> {
    return { raw: this.run(req), usage: usage() };
  }

  async generateText(req: Omit<StructuredRequest<z.ZodType>, "schema" | "schemaName">) {
    return { text: String(this.run(req)), usage: usage() };
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatEvent> {
    const script = this.chatScripts.get(req.promptId);
    if (!script) throw new Error(`FakeLlmClient: no chat script for "${req.promptId}"`);
    yield* script;
  }

  private run(req: { promptId: string; system: string; messages: { role: string; content: string }[] }): unknown {
    const lastUserMessage = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const call = { promptId: req.promptId, system: req.system, lastUserMessage };
    this.calls.push(call);
    const responder = this.responders.get(req.promptId);
    if (!responder) throw new Error(`FakeLlmClient: no response registered for "${req.promptId}"`);
    return responder(call);
  }
}

function usage(): LlmUsage {
  return { model: "fake-llm", tokensIn: 0, tokensOut: 0, latencyMs: 0 };
}
