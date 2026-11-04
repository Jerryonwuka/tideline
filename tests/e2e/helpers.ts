import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const randomPhone = () => `0803${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
export const e164 = (local: string) => `+234${local.slice(1)}`;

export async function outbox(request: APIRequestContext, phone: string) {
  const res = await request.get(`/api/dev/outbox?phone=${encodeURIComponent(e164(phone))}`);
  expect(res.ok(), "dev outbox must be enabled (APP_ENV=local, INTEGRATIONS_MODE=fake)").toBe(true);
  return (await res.json()) as { otps: string[]; messages: { channel: string; text?: string; params?: string[] }[] };
}

/** Signs in on /login with the code delivered to the fake messaging outbox. */
export async function logIn(page: Page, phone: string) {
  const before = (await outbox(page.request, phone)).otps.length;
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  let code = "";
  await expect
    .poll(async () => {
      const { otps } = await outbox(page.request, phone);
      code = otps[otps.length - 1] ?? "";
      return otps.length;
    })
    .toBeGreaterThan(before);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Log in" }).click();
}
