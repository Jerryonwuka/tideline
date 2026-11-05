import { createTranslator } from "next-intl";
import { defaultLocale, isLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import { serverEnv, type ServerEnv } from "@/server/env";
import { ResendEmailClient } from "./email/resend";
import { AnthropicLlmClient } from "./llm/anthropic";
import { LiveMessagingClient } from "./messaging/live";
import { TermiiSms } from "./messaging/termii";
import { WhatsAppCloud } from "./messaging/whatsapp";
import { AnthropicOcrClient } from "./ocr/anthropic";
import { OpenAiSttClient } from "./stt/openai";
import { FakeEmailClient } from "./email/fake";
import type { EmailClient } from "./email/types";
import { registerDevResponders } from "./llm/dev-responders";
import { FakeLlmClient } from "./llm/fake";
import type { LlmClient } from "./llm/types";
import { FakeMessagingClient } from "./messaging/fake";
import type { MessagingClient } from "./messaging/types";
import { FakeOcrClient } from "./ocr/fake";
import type { OcrClient } from "./ocr/types";
import { FakePaymentProvider } from "./payments/fake";
import { FlutterwaveProvider } from "./payments/flutterwave";
import { PaystackProvider } from "./payments/paystack";
import type { PaymentProvider } from "./payments/types";
import { FakeSttClient } from "./stt/fake";
import type { SttClient } from "./stt/types";
import { FakeWeatherClient } from "./weather/fake";
import { OpenMeteoWeatherClient } from "./weather/open-meteo";
import type { WeatherClient } from "./weather/types";

export interface Integrations {
  /** All registered payment providers; pick one with PaymentRouter, never by name. */
  paymentProviders: PaymentProvider[];
  messaging: MessagingClient;
  llm: LlmClient;
  stt: SttClient;
  ocr: OcrClient;
  weather: WeatherClient;
  email: EmailClient;
}

/**
 * Live adapters when PAYMENTS_MODE=live and a provider's keys are set. Otherwise fakes stand in
 * under the real ids, so payment_provider_routes decides exactly as it would in production.
 */
function paymentProviders(): PaymentProvider[] {
  const env = serverEnv();
  if (env.PAYMENTS_MODE === "live") {
    return [
      ...(env.PAYSTACK_SECRET_KEY ? [new PaystackProvider(env.PAYSTACK_SECRET_KEY)] : []),
      ...(env.FLUTTERWAVE_SECRET_KEY
        ? [new FlutterwaveProvider(env.FLUTTERWAVE_SECRET_KEY, env.FLUTTERWAVE_WEBHOOK_HASH ?? "")]
        : []),
    ];
  }
  return [new FakePaymentProvider(undefined, "paystack"), new FakePaymentProvider(undefined, "flutterwave")];
}

export function createFakeIntegrations(): Integrations {
  return {
    paymentProviders: paymentProviders(),
    messaging: new FakeMessagingClient({ printOtp: serverEnv().NODE_ENV !== "test" }),
    // Tests register their own responses; local dev gets plausible stand-ins.
    llm: serverEnv().NODE_ENV === "test" ? new FakeLlmClient() : registerDevResponders(new FakeLlmClient()),
    stt: new FakeSttClient(),
    ocr: new FakeOcrClient(),
    email: new FakeEmailClient(),
    weather: serverEnv().WEATHER_PROVIDER === "open-meteo" ? new OpenMeteoWeatherClient() : new FakeWeatherClient(),
  };
}

// Kept on globalThis so route handlers, server actions and pages share one instance in dev
// (Next can load a module more than once across bundles).
const holder = globalThis as unknown as { __tidelineIntegrations?: Integrations };

/** Process-wide integrations. Live vendor implementations are added milestone by milestone. */
export function integrations(): Integrations {
  if (holder.__tidelineIntegrations) return holder.__tidelineIntegrations;
  const env = serverEnv();
  holder.__tidelineIntegrations =
    env.INTEGRATIONS_MODE === "live" ? createLiveIntegrations(env) : createFakeIntegrations();
  return holder.__tidelineIntegrations;
}

/** Variables every live deployment needs; WhatsApp is optional (SMS covers it until Meta approves). */
export const LIVE_REQUIRED = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "TERMII_API_KEY",
  "TERMII_SENDER_ID",
  "RESEND_API_KEY",
  "EMAIL_FROM",
] as const;

export function missingLiveConfig(env: ServerEnv): string[] {
  return LIVE_REQUIRED.filter((k) => !env[k]);
}

/** Real vendors. Fails fast with the names (never the values) of missing variables. */
export function createLiveIntegrations(env: ServerEnv): Integrations {
  const missing = missingLiveConfig(env);
  if (missing.length) throw new Error(`INTEGRATIONS_MODE=live is missing: ${missing.join(", ")}`);
  const whatsapp =
    env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
      ? new WhatsAppCloud({
          accessToken: env.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
          apiVersion: env.WHATSAPP_API_VERSION,
        })
      : null;
  const sms = new TermiiSms({
    apiKey: env.TERMII_API_KEY!,
    senderId: env.TERMII_SENDER_ID!,
    baseUrl: env.TERMII_BASE_URL,
  });
  const claude = { apiKey: env.ANTHROPIC_API_KEY!, model: env.LLM_MODEL };
  return {
    paymentProviders: paymentProviders(),
    messaging: new LiveMessagingClient(sms, whatsapp, otpText),
    llm: new AnthropicLlmClient({ ...claude, fallbacks: env.LLM_FALLBACKS === "on" }),
    ocr: new AnthropicOcrClient(claude),
    stt: new OpenAiSttClient({ apiKey: env.OPENAI_API_KEY!, model: env.STT_MODEL }),
    email: new ResendEmailClient({ apiKey: env.RESEND_API_KEY!, from: env.EMAIL_FROM! }),
    weather: env.WEATHER_PROVIDER === "fake" ? new FakeWeatherClient() : new OpenMeteoWeatherClient(),
  };
}

async function otpText(code: string, locale: string): Promise<string> {
  const l = isLocale(locale) ? locale : defaultLocale;
  const t = createTranslator({ locale: l, messages: await loadMessages(l) }) as unknown as (
    key: string,
    values: Record<string, string>,
  ) => string;
  return t("auth.smsCode", { code });
}

/** Tests can swap in configured fakes. */
export function setIntegrationsForTesting(value: Integrations | undefined): void {
  holder.__tidelineIntegrations = value;
}

export type { LlmClient, MessagingClient, OcrClient, PaymentProvider, SttClient, WeatherClient };
