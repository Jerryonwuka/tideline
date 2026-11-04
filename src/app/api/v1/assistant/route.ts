import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { assertAssistantAccess, assistantContext } from "@/server/assistant/context";
import { runAssistant } from "@/server/assistant/run";
import { parseJson, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import { supabaseForRequest } from "@/server/supabase/server";

const body = z.object({
  org_id: uuid,
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30),
});

/**
 * The assistant, streamed as newline-delimited JSON events: {type:"text",text}, {type:"tool",name},
 * {type:"done"}. Tools run under the caller's own permissions (RLS).
 */
export const POST = route(async (request) => {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  const { org_id, messages } = await parseJson(request, body);
  assertAssistantAccess(me, org_id);
  const ctx = await assistantContext(db, org_id, me.locale ?? "en", "app");
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAssistant(ctx, messages))
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } catch {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error" })}\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
});
