import { expect, test } from "@playwright/test";
import { logIn, outbox, randomPhone } from "./helpers";

// M12: an off-platform charter is invoiced (no commission), sent by WhatsApp with a link to the
// client's invoice page, paid online with a test card, and marked paid.

test("owner invoices an off-platform charter; the client pays online", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const vesselName = `MV Ledger ${Math.floor(Math.random() * 1e5)}`;
  await page.goto("/login");
  await logIn(page, randomPhone());
  await page.getByLabel("Full name").fill("Owner Invoices");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Ledger Marine");
  await page.getByRole("radio", { name: "Vessel owner" }).check();
  await page.getByRole("checkbox", { name: "Ferry" }).uncheck();
  await page.getByRole("checkbox", { name: "Charter" }).check();
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill(vesselName);
  await page.getByRole("button", { name: "Save vessel" }).click();
  await expect(page).toHaveURL(/\/onboarding\/documents/);

  // Record a charter agreed outside Tideline: 3 days at ₦1,000,000 + ₦250,000 mobilisation.
  await page.goto("/charters");
  await page.getByLabel("Client").fill("Creek Logistics");
  await page.locator("#rc-rate").fill("1000000");
  await page.locator("#rc-from").fill("2026-12-01");
  await page.locator("#rc-to").fill("2026-12-03");
  await page.locator("#rc-mob").fill("250000");
  await page.getByRole("button", { name: "Record charter" }).click();
  await expect(page).toHaveURL(/\/charters\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Off platform")).toBeVisible();

  await page.getByRole("button", { name: "Invoice this charter" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: /INV-\d{4}-0001/ })).toBeVisible();
  await expect(page.getByTestId("invoice-total")).toContainText("3,250,000.00");

  // Send by WhatsApp.
  const clientPhone = randomPhone();
  await page.getByLabel("WhatsApp number").fill(clientPhone);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Sent.")).toBeVisible();
  await expect(page.getByTestId("invoice-pdf")).toBeVisible();
  const message = (await outbox(page.request, clientPhone)).messages.at(-1)!.text!;
  expect(message).toContain("Ledger Marine has sent you invoice");
  const link = message.match(/https?:\/\/\S+\/i\/[A-Za-z0-9_-]+/)![0];

  // The client pays with a test card.
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  await client.goto(new URL(link).pathname);
  await expect(client.getByRole("heading", { name: /Invoice INV-/ })).toBeVisible();
  await client.getByRole("button", { name: /Pay .*3,250,000\.00 now/ }).click();
  await client.getByRole("button", { name: "Pay with test card" }).click();
  await expect(client.getByTestId("invoice-paid")).toBeVisible();
  await ctx.close();

  await page.reload();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("invoice-outstanding")).toContainText("0.00");
});
