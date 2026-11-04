import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { e164, logIn, outbox, randomPhone } from "./helpers";

// M9 happy path through the real webhook: a captain's WhatsApp message becomes a draft with
// buttons, and the trip is saved only on Confirm. Locally the webhook is signed with the fakes'
// app secret.

const SECRET = "fake-whatsapp-secret";

async function whatsapp(request: APIRequestContext, from: string, message: Record<string, unknown>) {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: from.slice(1),
                  id: `wamid.${Math.random().toString(36).slice(2)}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  ...message,
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const signature = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
  return request.post("/api/webhooks/whatsapp", {
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    data: body,
  });
}

test("a WhatsApp trip log is saved only after Confirm", async ({ page }) => {
  test.setTimeout(120_000);
  const local = randomPhone();
  const from = e164(local);
  await page.goto("/login");
  await logIn(page, local);
  await page.getByLabel("Full name").fill("Owner Whats");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("WhatsApp Test Ferries");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill("MV Chatty");
  await page.getByLabel("Passenger capacity").fill("40");
  await page.getByRole("button", { name: "Save vessel" }).click();
  await expect(page).toHaveURL(/\/onboarding\/documents/);
  await page.goto("/routes");
  await page.getByLabel("From", { exact: true }).selectOption({ label: "CMS Marina · Not yet verified" });
  await page.getByLabel("To", { exact: true }).selectOption({ label: "Ikorodu · Not yet verified" });
  await page.getByLabel(/Base fare/).fill("1500");
  await page.getByRole("button", { name: "Save route" }).click();
  await expect(page.getByText("CMS Marina → Ikorodu")).toBeVisible();

  // A forged webhook is refused.
  const forged = await page.request.post("/api/webhooks/whatsapp", {
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" },
    data: "{}",
  });
  expect(forged.status()).toBe(401);

  const res = await whatsapp(page.request, from, {
    type: "text",
    text: { body: "Trip four CMS to Ikorodu eighteen passengers twenty-seven thousand" },
  });
  expect(res.ok()).toBe(true);
  const draft = (await outbox(page.request, local)).messages.at(-1)!;
  expect(draft.text).toContain("CMS Marina → Ikorodu on MV Chatty: 18 passengers");
  expect(draft.buttons?.map((b) => b.title)).toEqual(["Confirm", "Edit", "Cancel"]);

  // Nothing saved yet.
  await page.goto("/trips");
  await expect(page.getByText("CMS Marina → Ikorodu")).toHaveCount(0);

  await whatsapp(page.request, from, {
    type: "interactive",
    interactive: { type: "button_reply", button_reply: draft.buttons![0] },
  });
  expect((await outbox(page.request, local)).messages.at(-1)!.text).toBe("Saved. Thank you.");
  await page.reload();
  await expect(page.getByText("CMS Marina → Ikorodu")).toBeVisible();
});
