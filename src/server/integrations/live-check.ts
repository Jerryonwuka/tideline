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
    env.RESEND_API_KEY ? resendCheck(env.RESEND_API_KEY, fetchImpl) : missing("Resend (email)", "RESEND_API_KEY"),
  );
  checks.push(
    env.PAYMENTS_MODE !== "live"
      ? Promise.resolve({ service: "Paystack", ok: true, detail: "payments are fake (PAYMENTS_MODE)" })
      : env.PAYSTACK_SECRET_KEY
        ? http("Paystack", "https://api.paystack.co/transaction?perPage=1", {
            headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
          }).then((r) => ({
            ...r,
            detail: `${r.detail}${r.ok ? (env.PAYSTACK_SECRET_KEY!.startsWith("sk_test_") ? ", test key" : ", live key") : ""}`,
          }))
        : missing("Paystack", "PAYSTACK_SECRET_KEY"),
  );
  checks.push(
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? http("Supabase (public key)", `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
          headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        })
      : missing("Supabase (public key)", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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

/**
 * A sending-only Resend key (the safe choice) can't list domains: Resend answers 401
 * `restricted_api_key`, which still proves the key is real. A wrong key gets `validation_error`.
 */
async function resendCheck(apiKey: string, fetchImpl: typeof fetch): Promise<LiveCheck> {
  const service = "Resend (email)";
  try {
    const res = await fetchImpl("https://api.resend.com/domains", { headers: { authorization: `Bearer ${apiKey}` } });
    if (res.ok) return { service, ok: true, detail: `HTTP ${res.status}` };
    const body = (await res.json().catch(() => ({}))) as { name?: string };
    if (res.status === 401 && body.name === "restricted_api_key") {
      return { service, ok: true, detail: "sending-only key" };
    }
    return { service, ok: false, detail: `HTTP ${res.status}${body.name ? ` ${body.name}` : ""}` };
  } catch (err) {
    return { service, ok: false, detail: err instanceof Error ? err.name : "error" };
  }
}
