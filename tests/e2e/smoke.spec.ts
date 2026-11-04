import { expect, test } from "@playwright/test";

test("health check returns 200", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

test("home page renders in English, dark by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Every voyage, on record." })).toBeVisible();
  await expect(page.getByRole("img", { name: "Tideline" }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("theme switch changes to light and persists", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("radio", { name: "Light" }).first().click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("home page uses en-NG wording for Nigerian browsers", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-NG" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-NG");
  await expect(page.getByText(/before every trip leaves the jetty/)).toBeVisible();
  await context.close();
});
