import { expect, test } from "@playwright/test";
import { logIn, randomPhone } from "./helpers";

// M15 acceptance (UI): a charter vessel idle for 3+ days gets a suggestion showing how it was
// worked out; the owner can't publish below their minimum, and publishes to the board in one tap.

test("owner publishes an idle vessel from its suggestion", async ({ page }) => {
  test.setTimeout(120_000);
  const phone = randomPhone();
  const vesselName = `MV Idle Tide ${phone.slice(-5)}`;

  await page.goto("/login");
  await logIn(page, phone);
  await page.getByLabel("Full name").fill("Idle Owner");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Idle Tide Marine");
  await page.getByRole("radio", { name: "Vessel owner" }).check();
  await page.getByRole("checkbox", { name: "Ferry" }).uncheck();
  await page.getByRole("checkbox", { name: "Charter" }).check();
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill(vesselName);
  await page.getByLabel("Type").selectOption({ label: "Crew boat" });
  await page.getByRole("button", { name: "Save vessel" }).click();
  await expect(page).toHaveURL(/\/onboarding\/documents/);
  const me = (await (await page.request.get("/api/v1/me")).json()) as { memberships: { orgId: string }[] };
  const orgId = me.memberships[0]!.orgId;

  // A draft listing with a private minimum rate.
  await page.goto("/charters");
  await page.locator("#dayRate").fill("1200000");
  await page.locator("#minRate").fill("1000000");
  await page.getByLabel("Operating area").fill("Onne");
  await page.getByLabel("Minimum days").fill("1");
  await page.locator("#status").selectOption("draft");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // The morning job runs today and again five days later.
  const start = Date.now();
  for (const at of [start, start + 5 * 86_400_000]) {
    const res = await page.request.post("/api/dev/jobs/idle-vessels", {
      data: { now: new Date(at).toISOString(), orgId },
    });
    expect(res.ok()).toBe(true);
  }

  await page.goto("/charters");
  await page.getByRole("link", { name: "Idle vessels" }).click();
  const card = page.getByTestId("idle-suggestion").filter({ hasText: vesselName });
  await expect(card).toContainText("Idle 5 days");
  await expect(card.getByTestId("idle-inputs")).toContainText("Your minimum");
  await expect(card.getByTestId("idle-inputs")).toContainText("1,000,000.00");

  // Below the minimum is refused; the owner's rate is published with one tap.
  const rate = card.getByLabel(/Day rate/);
  await rate.fill("900000");
  await card.getByRole("button", { name: "Publish to the board" }).click();
  await expect(card.getByText("That rate is below your minimum rate")).toBeVisible();
  await rate.fill("1100000");
  await card.getByRole("button", { name: "Publish to the board" }).click();
  await expect(card.getByTestId("idle-published")).toBeVisible();

  await card.getByRole("link", { name: "View listing" }).click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  await expect(page.getByText(vesselName).first()).toBeVisible();
  await expect(page.getByText(/1,100,000(\.00)? \/ day/).first()).toBeVisible();
});
