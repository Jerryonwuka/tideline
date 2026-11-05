import { expect, test } from "@playwright/test";
import { isoDate, logIn, makePng, randomPhone } from "./helpers";

// M2 acceptance: an owner adds a vessel and crew, uploads a certificate photo, enters dates and
// sees valid / expiring / expired; compliance shows on the vessel page and dashboard; files are
// private with expiring links; wide photos are resized before upload.

test("owner sets up a vessel, crew and documents with live statuses", async ({ page, request }) => {
  test.slow();
  await page.goto("/login");
  await logIn(page, randomPhone());
  await page.getByLabel("Full name").fill("Bola Ahmed");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Fleet Test Ferries");
  await page.getByRole("button", { name: "Create company" }).click();

  // Step 3: first vessel.
  await expect(page).toHaveURL(/\/onboarding\/vessel$/);
  await page.getByLabel("Vessel name").fill("MV Test Star");
  await page.getByLabel("Passenger capacity").fill("50");
  await page.getByRole("button", { name: "Save vessel" }).click();

  // Step 4: a wide certificate photo with dates typed in.
  await expect(page).toHaveURL(/\/onboarding\/documents\?vessel=/);
  await page.getByLabel("Document type").selectOption("insurance");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "insurance.png", mimeType: "image/png", buffer: makePng(2400, 1200) });
  await page.getByLabel("Certificate number").fill("INS-2026-001");
  await page.getByLabel("Expiry date").fill(isoDate(200));
  await page.getByRole("button", { name: "Save document" }).click();

  // Step 5: invite the captain (creates the crew record too).
  await expect(page).toHaveURL(/\/onboarding\/invite$/);
  await page.getByLabel("Full name").fill("Emeka Obi");
  await page.getByLabel("Phone number", { exact: true }).fill(randomPhone());
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Dashboard: compliance for the vessel (only insurance is required while the NG rules are a draft).
  await expect(page.getByRole("meter", { name: "MV Test Star" })).toHaveAttribute("aria-valuenow", "100");

  // Two more documents for the vessel: one expiring soon, one expired.
  await page.getByRole("link", { name: "Vessels" }).click();
  await expect(page).toHaveURL(/\/vessels$/);
  await page.getByRole("link", { name: "MV Test Star" }).click();
  await expect(page).toHaveURL(/\/vessels\/[0-9a-f-]{36}$/);
  const vesselUrl = page.url();
  for (const [type, days] of [
    ["radio_licence", 10],
    ["load_line", -5],
  ] as const) {
    await page.getByRole("link", { name: "Add document" }).first().click();
    await page.getByLabel("Document type").selectOption(type);
    await page.getByLabel("Expiry date").fill(isoDate(days));
    await page.getByRole("button", { name: "Save document" }).click();
    await expect(page).toHaveURL(vesselUrl);
  }
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  await expect(page.getByText("Expiring soon", { exact: true })).toBeVisible();
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  await expect(page.getByRole("meter", { name: "Compliance" })).toHaveAttribute("aria-valuenow", "100");

  // Crew: the invited captain is on the crew list.
  await page.getByRole("link", { name: "Crew", exact: true }).click();
  await expect(page).toHaveURL(/\/crew$/);
  await expect(page.getByRole("link", { name: "Emeka Obi" })).toBeVisible();

  // The stored photo was shrunk to ≤1600 px and is served by a short-lived signed URL only.
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await page.getByRole("link", { name: "Insurance" }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  const img = page.locator("img[data-doc-preview]");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeLessThanOrEqual(1600);

  const signed = new URL((await img.getAttribute("src"))!);
  const token = signed.searchParams.get("token")!;
  const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as { exp: number; iat: number };
  expect(claims.exp - claims.iat).toBe(300);
  const objectPath = signed.pathname.replace("/storage/v1/object/sign/", "");
  const publicUrl = `${signed.origin}/storage/v1/object/public/${objectPath}`;
  expect((await request.get(publicUrl)).ok()).toBe(false);
  expect((await request.get(`${signed.origin}/storage/v1/object/${objectPath}`)).ok()).toBe(false);
});
