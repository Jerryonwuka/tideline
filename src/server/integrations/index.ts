import { serverEnv } from "@/server/env";
import { registerDevResponders } from "./llm/dev-responders";
import { FakeLlmClient } from "./llm/fake";
import type { LlmClient } from "./llm/types";
import { FakeMessagingClient } from "./messaging/fake";
import type { MessagingClient } from "./messaging/types";
import { FakeOcrClient } from "./ocr/fake";
import type { OcrClient } from "./ocr/types";
import { FakePaymentProvider } from "./payments/fake";
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
}

export function createFakeIntegrations(): Integrations {
  return {
    paymentProviders: [new FakePaymentProvider()],
    messaging: new FakeMessagingClient({ printOtp: serverEnv().NODE_ENV !== "test" }),
    // Tests register their own responses; local dev gets plausible stand-ins.
    llm: serverEnv().NODE_ENV === "test" ? new FakeLlmClient() : registerDevResponders(new FakeLlmClient()),
    stt: new FakeSttClient(),
    ocr: new FakeOcrClient(),
    weather: serverEnv().WEATHER_PROVIDER === "open-meteo" ? new OpenMeteoWeatherClient() : new FakeWeatherClient(),
  };
}

// Kept on globalThis so route handlers, server actions and pages share one instance in dev
// (Next can load a module more than once across bundles).
const holder = globalThis as unknown as { __tidelineIntegrations?: Integrations };

/** Process-wide integrations. Live vendor implementations are added milestone by milestone. */
export function integrations(): Integrations {
  if (holder.__tidelineIntegrations) return holder.__tidelineIntegrations;
  const mode = serverEnv().INTEGRATIONS_MODE;
  if (mode === "live") {
    throw new Error("INTEGRATIONS_MODE=live: no live integrations are implemented yet");
  }
  holder.__tidelineIntegrations = createFakeIntegrations();
  return holder.__tidelineIntegrations;
}

/** Tests can swap in configured fakes. */
export function setIntegrationsForTesting(value: Integrations | undefined): void {
  holder.__tidelineIntegrations = value;
}

export type { LlmClient, MessagingClient, OcrClient, PaymentProvider, SttClient, WeatherClient };
