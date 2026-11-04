import { expect, test, type Page } from "@playwright/test";

/** Opens the home page and waits for React to hydrate (the theme switch marks its active option). */
async function openHome(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("radio", { checked: true }).last()).toBeAttached();
}

test("health check returns 200", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

test("home page renders in English, dark by default", async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole("heading", { level: 1, name: "The operating system for your fleet" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Tideline" }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("theme switch changes to light and persists", async ({ page, isMobile }) => {
  await openHome(page);
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("radio", { name: "Light" }).filter({ visible: true }).first().click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("get started carries the phone number into the login form", async ({ page }) => {
  await openHome(page);
  await page.locator("#start").getByRole("textbox").fill("0803 000 0001");
  await page.locator("#start").getByRole("button", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/login$/);
  // The login page picks the number up from sessionStorage (never the URL) and pre-fills it.
  await expect(page.getByLabel("Phone number")).toHaveValue("0803 000 0001");
  expect(await page.evaluate(() => sessionStorage.getItem("tl_start_phone"))).toBeNull();
});

test("home page uses en-NG wording for Nigerian browsers", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-NG" });
  const page = await context.newPage();
  await openHome(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-NG");
  await expect(page.getByText(/first Lagos ferry and crew-boat operators/)).toBeVisible();
  await context.close();
});
