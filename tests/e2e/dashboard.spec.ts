import { expect, test } from "@playwright/test";
import { logIn, randomPhone } from "./helpers";

// M10: the owner's dashboard (today's figures, alerts, idle vessels), the weekly report and the
// assistant (answers from tools, streamed; declines to move money).

test("owner sees the dashboard and weekly report, and asks the assistant", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await logIn(page, randomPhone());
  await page.getByLabel("Full name").fill("Owner Dash");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Dashboard Test Ferries");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill("MV Resting");
  await page.getByLabel("Passenger capacity").fill("20");
  await page.getByRole("button", { name: "Save vessel" }).click();
  await expect(page).toHaveURL(/\/onboarding\/documents/);

  await page.goto("/dashboard");
  await expect(page.getByTestId("dash-trips")).toHaveText("0");
  await expect(page.getByTestId("dash-passengers")).toHaveText("0");
  await expect(page.getByTestId("dash-idle")).toContainText("MV Resting");

  await page.goto("/reports/weekly");
  await expect(page.getByRole("heading", { name: "Weekly report" })).toBeVisible();
  await expect(page.getByTestId("week-net")).toContainText("0.00");

  await page.getByRole("link", { name: "Assistant", exact: true }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await page.getByRole("button", { name: "Which boats are idle?" }).click();
  const answer = page.locator('[data-role="assistant"]').last();
  await expect(answer).toContainText("Idle this week: MV Resting.");
  await expect(answer).toContainText("Checked: idle vessels");

  await page.getByLabel("Ask").fill("Send 5000 naira to Bayo");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText("can't move money");
});
