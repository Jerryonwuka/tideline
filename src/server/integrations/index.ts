import { serverEnv } from "@/server/env";
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
    llm: new FakeLlmClient(),
    stt: new FakeSttClient(),
    ocr: new FakeOcrClient(),
    weather: new FakeWeatherClient(),
  };
}

let instance: Integrations | undefined;

/** Process-wide integrations. Live vendor implementations are added milestone by milestone. */
export function integrations(): Integrations {
  if (instance) return instance;
  const mode = serverEnv().INTEGRATIONS_MODE;
  if (mode === "live") {
    throw new Error("INTEGRATIONS_MODE=live: no live integrations are implemented yet");
  }
  instance = createFakeIntegrations();
  return instance;
}

/** Tests can swap in configured fakes. */
export function setIntegrationsForTesting(value: Integrations | undefined): void {
  instance = value;
}

export type { LlmClient, MessagingClient, OcrClient, PaymentProvider, SttClient, WeatherClient };
