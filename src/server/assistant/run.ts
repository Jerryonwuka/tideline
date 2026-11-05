import "server-only";
import type { Json } from "@/lib/database.types";
import { integrations } from "@/server/integrations";
import type { ChatEvent, ChatRequest, LlmMessage } from "@/server/integrations/llm/types";
import { supabaseAdmin } from "@/server/supabase/admin";
import { TOOLS, type ToolContext } from "./tools";

// §10.6 assistant: a tool-calling agent that answers only from tool results. Runs in the app
// (streamed) and on WhatsApp (short replies). Read and draft tools only.

export const ASSISTANT_PROMPT_ID = "assistant";
export const ASSISTANT_PROMPT_VERSION = "assistant@1";
const MAX_TOOL_ROUNDS = 4;

export function assistantSystemPrompt(p: {
  countryName: string;
  locale: string;
  currency: string;
  channel: "app" | "whatsapp";
  today: string;
}) {
  return `You are the Tideline assistant for a vessel operator in ${p.countryName}. Answer only from tool
results. If the data is missing, say so and suggest how to add it. Keep replies short; on
WhatsApp use at most 5 lines. Reply in ${p.locale}. Show money in ${p.currency} and dates in the user's local format.
You can prepare drafts but never send money, delete records or approve safety overrides.
Today is ${p.today}. You are replying ${p.channel === "whatsapp" ? "on WhatsApp" : "in the app"}.`;
}

export type AssistantEvent = { type: "text"; text: string } | { type: "tool"; name: string } | { type: "done" };

/**
 * Runs the conversation to a final answer, calling tools as the model asks. Yields text as it
 * streams and a marker for each tool used.
 */
export async function* runAssistant(
  ctx: ToolContext & { countryName: string; channel: "app" | "whatsapp"; today: string },
  history: LlmMessage[],
): AsyncGenerator<AssistantEvent> {
  const llm = integrations().llm;
  const started = Date.now();
  const messages: ChatRequest["messages"] = [...history];
  const used: string[] = [];
  let usage = { model: null as string | null, tokensIn: 0, tokensOut: 0 };
  let status: "done" | "failed" = "done";
  let error: string | null = null;
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const calls: Extract<ChatEvent, { type: "tool_call" }>[] = [];
      let text = "";
      let raw: unknown;
      for await (const event of llm.chat({
        promptId: ASSISTANT_PROMPT_ID,
        promptVersion: ASSISTANT_PROMPT_VERSION,
        system: assistantSystemPrompt(ctx),
        messages,
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      })) {
        if (event.type === "text") {
          text += event.text;
          yield event;
        } else if (event.type === "tool_call") calls.push(event);
        else {
          raw = event.raw;
          usage = {
            model: event.usage.model,
            tokensIn: usage.tokensIn + event.usage.tokensIn,
            tokensOut: usage.tokensOut + event.usage.tokensOut,
          };
        }
      }
      if (!calls.length) break;
      // The live client needs its own blocks back (tool calls, thinking) before the tool results.
      if (text || raw !== undefined) messages.push({ role: "assistant", content: text, raw });
      for (const call of calls) {
        const t = TOOLS.find((x) => x.name === call.name);
        yield { type: "tool", name: call.name };
        used.push(call.name);
        let result: unknown;
        if (!t) result = { error: "unknown tool" };
        else {
          const input = t.inputSchema.safeParse(call.input ?? {});
          result = input.success
            ? await (t.run as (c: ToolContext, i: unknown) => Promise<unknown>)(ctx, input.data).catch(() => ({
                error: "tool failed",
              }))
            : { error: "invalid input", issues: input.error.issues.map((i) => i.message) };
        }
        messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
      }
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message.slice(0, 300) : "error";
    throw err;
  } finally {
    await supabaseAdmin()
      .from("ai_jobs")
      .insert({
        org_id: ctx.orgId,
        kind: "assistant",
        input_ref: `assistant:${ctx.channel}`,
        prompt_version: ASSISTANT_PROMPT_VERSION,
        model: usage.model,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        latency_ms: Date.now() - started,
        status,
        error,
        output: { tools: used } as unknown as Json,
      });
  }
  yield { type: "done" };
}

/** Collects the whole answer (WhatsApp). */
export async function askAssistant(
  ctx: Parameters<typeof runAssistant>[0],
  question: string,
): Promise<{ text: string; tools: string[] }> {
  let text = "";
  const tools: string[] = [];
  for await (const e of runAssistant(ctx, [{ role: "user", content: question }])) {
    if (e.type === "text") text += e.text;
    if (e.type === "tool") tools.push(e.name);
  }
  return { text: text.trim(), tools };
}
