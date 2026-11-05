import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { e164, logIn, randomPhone } from "./helpers";

// M1b: platform admins see countries and versioned rule sets; everyone else gets a 404.
// Read-only on purpose: publishing would change the shared local database for other tests.

test("platform admin reviews countries and the draft Nigeria rule set", async ({ page }) => {
  test.slow();
  const phone = randomPhone();
  await page.goto("/login");
  await logIn(page, phone);
  await page.getByLabel("Full name").fill("Admin Tester");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // Not an admin yet: the console does not exist for them.
  const notAdmin = await page.goto("/admin/countries");
  expect(notAdmin?.status()).toBe(404);

  const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", {
    max: 1,
  });
  try {
    await sql`insert into public.platform_admins (user_id) select id from public.profiles where phone_e164 = ${e164(phone)}`;
  } finally {
    await sql.end();
  }

  await page.goto("/admin/countries");
  await expect(page.getByRole("heading", { name: "Countries" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /NG\s*Nigeria/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /ZZ\s*Testland/ })).toBeVisible();

  await page.getByRole("link", { name: "Rule sets" }).click();
  await page.getByRole("link", { name: "Nigeria · v1" }).click();
  await expect(page.getByText("Draft")).toBeVisible();
  await expect(page.getByRole("cell", { name: "LASWA licence" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Cabotage registration" })).toBeVisible();
});
