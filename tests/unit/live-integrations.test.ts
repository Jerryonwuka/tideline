import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ResendEmailClient } from "@/server/integrations/email/resend";
import { AnthropicLlmClient, chatMessages, LlmRefusalError, toTool } from "@/server/integrations/llm/anthropic";
import { LiveMessagingClient } from "@/server/integrations/messaging/live";
import { TermiiSms } from "@/server/integrations/messaging/termii";
import { templateLanguage, WhatsAppCloud } from "@/server/integrations/messaging/whatsapp";
import { OpenAiSttClient } from "@/server/integrations/stt/openai";
import { createLiveIntegrations, missingLiveConfig } from "@/server/integrations";
import type { ServerEnv } from "@/server/env";

type Call = { url: string; init: RequestInit | undefined };

/** A fetch that records requests and answers from a function of the URL. */
function stubFetch(answer: (url: string, body: unknown) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const { status = 200, json } = answer(url, body);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

const bodyOf = (c: Call) => JSON.parse(String(c.init?.body)) as Record<string, unknown>;

describe("Termii SMS", () => {
  it("sends sign-in codes on the DND route without the plus sign", async () => {
    const f = stubFetch(() => ({ json: { message_id: "t-1", message: "Successfully Sent" } }));
    const sms = new TermiiSms({ apiKey: "k", senderId: "Tideline", baseUrl: "https://api.ng.termii.com" }, f.impl);
    const r = await sms.send("+2348031234567", "code", "dnd");
    expect(r).toEqual({ providerMessageId: "t-1", status: "accepted" });
    expect(f.calls[0]!.url).toBe("https://api.ng.termii.com/api/sms/send");
    expect(bodyOf(f.calls[0]!)).toMatchObject({ to: "2348031234567", from: "Tideline", channel: "dnd" });
  });

  it("reports a failure instead of throwing", async () => {
    const f = stubFetch(() => ({ status: 400, json: { message: "Insufficient balance" } }));
    const sms = new TermiiSms({ apiKey: "k", senderId: "S", baseUrl: "https://x" }, f.impl);
    expect((await sms.send("+2348031234567", "hi", "generic")).status).toBe("failed");
  });
});

describe("Live messaging", () => {
  const termii = (f: ReturnType<typeof stubFetch>) =>
    new TermiiSms({ apiKey: "k", senderId: "S", baseUrl: "https://termii" }, f.impl);
  const otpText = async (code: string) => `Code ${code}`;

  it("falls back to SMS when WhatsApp is outside the 24-hour window", async () => {
    const f = stubFetch((url) =>
      url.includes("graph.facebook.com")
        ? { status: 400, json: { error: { code: 131047, message: "Re-engagement message" } } }
        : { json: { message_id: "sms-1" } },
    );
    const wa = new WhatsAppCloud({ accessToken: "t", phoneNumberId: "123", apiVersion: "v23.0" }, f.impl);
    const client = new LiveMessagingClient(termii(f), wa, otpText);
    const r = await client.send({ channel: "whatsapp", kind: "text", toE164: "+2348031234567", text: "Invoice ready" });
    expect(r.providerMessageId).toBe("sms-1");
    expect(f.calls.map((c) => new URL(c.url).host)).toEqual(["graph.facebook.com", "termii"]);
  });

  it("does not turn a failed template into SMS (callers send their own wording)", async () => {
    const f = stubFetch(() => ({ status: 400, json: { error: { code: 132001 } } }));
    const wa = new WhatsAppCloud({ accessToken: "t", phoneNumberId: "123", apiVersion: "v23.0" }, f.impl);
    const client = new LiveMessagingClient(termii(f), wa, otpText);
    const r = await client.send({
      channel: "whatsapp",
      kind: "template",
      toE164: "+2348031234567",
      template: "document_expiry",
      locale: "en-NG",
      params: ["a"],
    });
    expect(r.status).toBe("failed");
    expect(f.calls).toHaveLength(1);
    expect(bodyOf(f.calls[0]!)).toMatchObject({
      type: "template",
      template: { name: "document_expiry", language: { code: "en" } },
    });
  });

  it("sends everything by SMS until WhatsApp is set up, and codes by the DND route", async () => {
    const f = stubFetch(() => ({ json: { message_id: "sms-2" } }));
    const client = new LiveMessagingClient(termii(f), null, otpText);
    await client.send({
      channel: "whatsapp",
      kind: "interactive",
      toE164: "+2348031234567",
      body: "Confirm trip?",
      buttons: [{ id: "yes", title: "Yes" }],
    });
    await client.sendOtp("+2348031234567", "123456", "en");
    expect(bodyOf(f.calls[0]!)).toMatchObject({ sms: "Confirm trip?", channel: "generic" });
    expect(bodyOf(f.calls[1]!)).toMatchObject({ sms: "Code 123456", channel: "dnd" });
  });

  it("limits reply buttons to Meta's three, 20 characters each", async () => {
    const f = stubFetch(() => ({ json: { messages: [{ id: "wamid.1" }] } }));
    const wa = new WhatsAppCloud({ accessToken: "t", phoneNumberId: "123", apiVersion: "v23.0" }, f.impl);
    await wa.send({
      channel: "whatsapp",
      kind: "interactive",
      toE164: "+2348031234567",
      body: "Pick",
      buttons: ["a", "b", "c", "d"].map((id) => ({ id, title: "A very long button title here" })),
    });
    const buttons = (bodyOf(f.calls[0]!).interactive as { action: { buttons: { reply: { title: string } }[] } }).action
      .buttons;
    expect(buttons).toHaveLength(3);
    expect(buttons[0]!.reply.title).toHaveLength(20);
    expect(templateLanguage("pt-BR")).toBe("pt_BR");
  });
});

describe("Resend email", () => {
  it("sends attachments as base64", async () => {
    const f = stubFetch(() => ({ json: { id: "em_1" } }));
    const email = new ResendEmailClient({ apiKey: "k", from: "Tideline <no-reply@example.test>" }, f.impl);
    const r = await email.send({
      to: "client@example.test",
      subject: "Invoice",
      text: "Attached",
      attachments: [{ filename: "inv.pdf", contentType: "application/pdf", content: new Uint8Array([1, 2, 3]) }],
    });
    expect(r).toEqual({ id: "em_1", status: "accepted" });
    expect(bodyOf(f.calls[0]!)).toMatchObject({ to: ["client@example.test"], attachments: [{ content: "AQID" }] });
  });
});

describe("OpenAI speech-to-text", () => {
  it("uploads the voice note and hints English", async () => {
    const f = stubFetch(() => ({ json: { text: " Trip 4 CMS to Ikorodu ", language: "english", duration: 4.2 } }));
    const stt = new OpenAiSttClient({ apiKey: "k", model: "whisper-1" }, f.impl);
    const t = await stt.transcribe({
      audio: new Uint8Array([1]),
      mimeType: "audio/ogg; codecs=opus",
      languageHints: ["en-NG", "pcm"],
    });
    expect(t).toMatchObject({ text: "Trip 4 CMS to Ikorodu", durationSec: 4.2, model: "whisper-1" });
    const form = f.calls[0]!.init!.body as FormData;
    expect(form.get("language")).toBe("en");
    expect((form.get("file") as File).name).toBe("voice.ogg");
  });
});

function anthropicWith(answer: (body: Record<string, unknown>) => { status?: number; json: unknown }) {
  const f = stubFetch((_url, body) => answer(body as Record<string, unknown>));
  const client = new Anthropic({ apiKey: "test", fetch: f.impl, maxRetries: 0 });
  return { f, llm: new AnthropicLlmClient({ apiKey: "test", model: "claude-sonnet-5-5", fallbacks: true }, client) };
}

const message = (content: unknown[], stop_reason = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content,
  stop_reason,
  stop_details: stop_reason === "refusal" ? { type: "refusal", category: "cyber", explanation: null } : null,
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 0 },
});

describe("Claude client", () => {
  const schema = z.object({ expiryDate: z.string().nullable(), confidence: z.number().min(0).max(1) });

  it("asks for JSON-schema output with the refusal fallback and returns the parsed object", async () => {
    const { f, llm } = anthropicWith(() => ({
      json: message([{ type: "text", text: '{"expiryDate":"2027-01-31","confidence":0.9}' }]),
    }));
    const res = await llm.generateStructured({
      promptId: "ocr",
      promptVersion: "1",
      system: "Extract",
      messages: [{ role: "user", content: "text", images: [{ mimeType: "image/jpeg", data: "AAAA" }] }],
      schema,
      schemaName: "doc",
    });
    expect(res.raw).toEqual({ expiryDate: "2027-01-31", confidence: 0.9 });
    expect(res.usage).toMatchObject({ model: "claude-sonnet-5-5", tokensIn: 12, tokensOut: 5 });
    const body = bodyOf(f.calls[0]!);
    expect(body).toMatchObject({
      model: "claude-sonnet-5-5",
      fallbacks: "default",
      output_config: { format: { type: "json_schema" } },
    });
    expect(f.calls[0]!.init?.headers).toBeDefined();
    const content = (body.messages as { content: { type: string }[] }[])[0]!.content;
    expect(content.map((b) => b.type)).toEqual(["image", "text"]);
  });

  it("throws a refusal error the caller can treat as a failed job", async () => {
    const { llm } = anthropicWith(() => ({ json: message([], "refusal") }));
    await expect(
      llm.generateText({ promptId: "x", promptVersion: "1", system: "s", messages: [{ role: "user", content: "q" }] }),
    ).rejects.toBeInstanceOf(LlmRefusalError);
  });

  it("passes the model's own blocks back before tool results, grouped in one message", () => {
    const raw = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "tool_use", id: "tu_1", name: "fleet", input: {} },
      { type: "tool_use", id: "tu_2", name: "docs", input: {} },
    ];
    const msgs = chatMessages([
      { role: "user", content: "How is my fleet?" },
      { role: "assistant", content: "", raw },
      { role: "tool", toolCallId: "tu_1", content: "{}" },
      { role: "tool", toolCallId: "tu_2", content: "{}" },
    ]);
    expect(msgs).toHaveLength(3);
    expect(msgs[1]!.content).toBe(raw);
    expect((msgs[2]!.content as { tool_use_id: string }[]).map((b) => b.tool_use_id)).toEqual(["tu_1", "tu_2"]);
  });

  it("turns Zod tool inputs into object schemas", () => {
    const tool = toTool({ name: "t", description: "d", inputSchema: z.object({ days: z.number().int().default(30) }) });
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema).not.toHaveProperty("$schema");
  });
});

describe("Live configuration", () => {
  const env = { INTEGRATIONS_MODE: "live", PAYMENTS_MODE: "fake" } as unknown as ServerEnv;

  it("names every missing setting and refuses to start", () => {
    expect(missingLiveConfig(env)).toEqual([
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "TERMII_API_KEY",
      "TERMII_SENDER_ID",
      "RESEND_API_KEY",
      "EMAIL_FROM",
    ]);
    expect(() => createLiveIntegrations(env)).toThrow(/missing: ANTHROPIC_API_KEY/);
  });
});
