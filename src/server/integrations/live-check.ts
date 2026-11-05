import Anthropic from "@anthropic-ai/sdk";
import type { ServerEnv } from "@/server/env";

export interface LiveCheck {
  service: string;
  ok: boolean;
  detail: string;
}

/**
 * Read-only checks that each live key works: no messages are sent and no AI tokens are spent.
 * Results carry status codes and names only, never key values.
 */
export async function checkLiveIntegrations(env: ServerEnv, fetchImpl: typeof fetch = fetch): Promise<LiveCheck[]> {
  const checks: Promise<LiveCheck>[] = [];
  const http = async (service: string, url: string, init?: RequestInit): Promise<LiveCheck> => {
    try {
      const res = await fetchImpl(url, init);
      return { service, ok: res.ok, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { service, ok: false, detail: err instanceof Error ? err.name : "error" };
    }
  };
  const missing = (service: string, name: string): Promise<LiveCheck> =>
    Promise.resolve({ service, ok: false, detail: `${name} not set` });

  checks.push(
    env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: fetchImpl }).models
          .retrieve(env.LLM_MODEL)
          .then(() => ({ service: "Anthropic", ok: true, detail: `model ${env.LLM_MODEL} available` }))
          .catch((err: unknown) => ({
            service: "Anthropic",
            ok: false,
            detail: err instanceof Anthropic.APIError ? `HTTP ${err.status}` : "unreachable",
          }))
      : missing("Anthropic", "ANTHROPIC_API_KEY"),
  );
  checks.push(
    env.OPENAI_API_KEY
      ? http("OpenAI (speech-to-text)", `https://api.openai.com/v1/models/${env.STT_MODEL}`, {
          headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
        })
      : missing("OpenAI (speech-to-text)", "OPENAI_API_KEY"),
  );
  checks.push(
    env.TERMII_API_KEY
      ? http(
          "Termii (SMS)",
          `${env.TERMII_BASE_URL.replace(/\/$/, "")}/api/get-balance?api_key=${encodeURIComponent(env.TERMII_API_KEY)}`,
        )
      : missing("Termii (SMS)", "TERMII_API_KEY"),
  );
  checks.push(
    env.RESEND_API_KEY
      ? http("Resend (email)", "https://api.resend.com/domains", {
          headers: { authorization: `Bearer ${env.RESEND_API_KEY}` },
        })
      : missing("Resend (email)", "RESEND_API_KEY"),
  );
  checks.push(
    env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
      ? http(
          "WhatsApp Cloud API",
          `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}`,
          { headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } },
        )
      : Promise.resolve({ service: "WhatsApp Cloud API", ok: true, detail: "not set up yet: messages go by SMS" }),
  );
  return Promise.all(checks);
}
