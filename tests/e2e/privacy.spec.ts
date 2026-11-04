import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { e164, logIn, randomPhone } from "./helpers";

// M16 acceptance: export and delete requests work end to end; admin reads of passenger data
// require and log a reason; the privacy notice and processor list are public.

const dbUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function signUp(page: Page, name: string) {
  const phone = randomPhone();
  await page.goto("/login");
  await logIn(page, phone);
  await page.getByLabel("Full name").fill(name);
  await expect(page.getByText("privacy notice")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  return phone;
}

test("export and deletion requests go through the admin queue", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const sql = postgres(dbUrl, { max: 1 });
  try {
    // Public pages.
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
    await expect(page.getByTestId("privacy-notice")).toContainText("collected for passenger safety");
    await page.getByRole("link", { name: "See the processor list" }).click();
    await expect(page.getByTestId("processors")).toContainText("Supabase");

    // The person asks for a copy, then for deletion.
    const name = `Privacy Person ${Date.now() % 100000}`;
    await signUp(page, name);
    await page.goto("/settings/privacy");
    await page.getByRole("checkbox", { name: "Send me news and offers" }).check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.getByRole("button", { name: "Request a copy" }).click();
    await expect(page.getByText("We’ll prepare your file within 30 days.")).toBeVisible();

    // A platform admin prepares the export.
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    const adminPhone = await signUp(admin, "Console Admin");
    await sql`insert into public.platform_admins (user_id) select id from public.profiles where phone_e164 = ${e164(adminPhone)}`;
    await admin.goto("/admin/privacy");
    const exportRow = admin
      .getByTestId("admin-privacy-request")
      .filter({ hasText: name })
      .filter({ hasText: "Export" });
    await exportRow.getByRole("button", { name: "Prepare export" }).click();
    await expect(exportRow).toContainText("Done");

    // The person downloads it: everything about them, as JSON.
    await page.reload();
    const href = await page.getByTestId("privacy-download").getAttribute("href");
    const file = await page.request.get(href!);
    expect(file.ok()).toBe(true);
    const data = (await file.json()) as {
      profile: { full_name: string };
      consents: { purpose: string; granted: boolean }[];
    };
    expect(data.profile.full_name).toBe(name);
    expect(data.consents).toEqual(
      expect.arrayContaining([expect.objectContaining({ purpose: "marketing", granted: true })]),
    );

    // Deletion: requested with confirmation, carried out by the admin, account gone.
    await page.getByRole("checkbox", { name: "I understand this can’t be undone" }).check();
    await page.getByRole("button", { name: "Request deletion" }).click();
    await expect(page.getByText("We’ll delete your account within 30 days.")).toBeVisible();
    await admin.reload();
    const deleteRow = admin
      .getByTestId("admin-privacy-request")
      .filter({ hasText: name })
      .filter({ hasText: "Deletion" });
    await deleteRow.getByRole("button", { name: "Delete account" }).click();
    // Once erased the row no longer shows their name, so wait on the account itself.
    await expect.poll(async () => (await sql`select id from public.profiles where full_name = ${name}`).length).toBe(0);
    await page.goto("/settings/privacy");
    await expect(page).toHaveURL(/\/login/);
    await adminCtx.close();
  } finally {
    await sql.end();
  }
});

test("opening a manifest as admin needs a reason, and the read is logged", async ({ page }) => {
  test.setTimeout(90_000);
  const sql = postgres(dbUrl, { max: 1 });
  try {
    const phone = await signUp(page, "Manifest Admin");
    await sql`insert into public.platform_admins (user_id) select id from public.profiles where phone_e164 = ${e164(phone)}`;
    // A trip with one passenger, made directly in the database.
    const [org] =
      await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
                            values ('Manifest Ferries', 'ferry_operator', 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{ferry}') returning id`;
    try {
      const [v] =
        await sql`insert into public.vessels (org_id, name, type, operating_country_code, passenger_capacity, ferry_enabled)
                            values (${org!.id}, 'MV Lookup', 'ferry', 'NG', 10, true) returning id`;
      const [j1, j2] = await sql`select id from public.jetties order by name limit 2`;
      const [r] =
        await sql`insert into public.routes (org_id, origin_jetty_id, destination_jetty_id, duration_min, base_fare_minor, currency)
                            values (${org!.id}, ${j1!.id}, ${j2!.id}, 30, 100000, 'NGN') returning id`;
      const [t] = await sql`insert into public.trips (org_id, vessel_id, route_id, currency, scheduled_departure)
                            values (${org!.id}, ${v!.id}, ${r!.id}, 'NGN', now()) returning id`;
      await sql`insert into public.manifest_entries (org_id, trip_id, full_name, seats) values (${org!.id}, ${t!.id}, 'Kemi Lookup', 2)`;

      await page.goto("/admin/passengers");
      await page.getByLabel("Trip id").fill(t!.id);
      await page.getByLabel("Reason").fill("check");
      await page.getByRole("button", { name: "Open manifest" }).click();
      await expect(page.getByText("Give a reason of at least 10 characters")).toBeVisible();
      await expect(page.getByTestId("admin-manifest")).toHaveCount(0);

      await page.getByLabel("Reason").fill("Police request ref 4471 about a missing passenger");
      await page.getByRole("button", { name: "Open manifest" }).click();
      await expect(page.getByTestId("admin-manifest")).toContainText("Kemi Lookup");
      await page.reload();
      await expect(page.getByTestId("admin-access-log")).toContainText("Police request ref 4471");
    } finally {
      await sql`delete from public.orgs where id = ${org!.id}`;
    }
  } finally {
    await sql.end();
  }
});
