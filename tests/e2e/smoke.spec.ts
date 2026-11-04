import { expect, test } from "@playwright/test";

test("health check returns 200", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

test("home page renders in English", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Tideline" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("home page uses en-NG wording for Nigerian browsers", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-NG" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-NG");
  await expect(page.getByText(/before every trip leaves the jetty/)).toBeVisible();
  await context.close();
});
