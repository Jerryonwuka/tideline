import { expect, test } from "@playwright/test";
import { logIn, outbox, randomPhone } from "./helpers";

// M4 acceptance: a captain runs a scheduled trip end to end and the owner sees it in the daily
// report; the manifest can't exceed capacity; after departure additions are amendments.

test("captain runs a scheduled trip; owner sees it in the daily report", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const captainPhone = randomPhone();

  // Owner: company, vessel (5 seats), captain invite.
  await page.goto("/login");
  await logIn(page, randomPhone());
  await page.getByLabel("Full name").fill("Owner Ferry");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Trip Test Ferries");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill("MV Lagos One");
  await page.getByLabel("Passenger capacity").fill("5");
  await page.getByRole("button", { name: "Save vessel" }).click();
  await page.getByRole("link", { name: "Skip for now" }).click();
  await page.getByLabel("Full name").fill("Kunle Bello");
  await page.getByLabel("Phone number", { exact: true }).fill(captainPhone);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Assign the captain to the vessel.
  await page.getByRole("link", { name: "Vessels", exact: true }).click();
  await expect(page).toHaveURL(/\/vessels$/);
  await page.getByRole("link", { name: "MV Lagos One" }).click();
  await expect(page).toHaveURL(/\/vessels\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("Kunle Bello")).toBeVisible();

  // Route CMS → Ikorodu with a daily departure.
  await page.getByRole("link", { name: "Routes", exact: true }).click();
  await expect(page).toHaveURL(/\/routes$/);
  await page.getByLabel("From", { exact: true }).selectOption({ label: "CMS Marina · Not yet verified" });
  await page.getByLabel("To", { exact: true }).selectOption({ label: "Ikorodu · Not yet verified" });
  await page.getByLabel(/Base fare/).fill("1500");
  await page.getByRole("button", { name: "Save route" }).click();
  await expect(page.getByText("CMS Marina → Ikorodu")).toBeVisible();
  await page.getByLabel("Departs at").fill("23:45");
  await page.getByRole("button", { name: "Save departure" }).click();
  await expect(page.getByText("23:45")).toBeVisible();

  // Captain joins through the invite and opens today's trip.
  const link = (await outbox(page.request, captainPhone)).messages.find((m) => m.channel === "whatsapp")?.params?.[3];
  const ctx = await browser.newContext();
  const captain = await ctx.newPage();
  await captain.goto(new URL(link!).pathname);
  await captain.getByRole("link", { name: "Log in to accept" }).click();
  await logIn(captain, captainPhone);
  await captain.getByLabel("Full name").fill("Kunle Bello");
  await captain.getByRole("button", { name: "Continue" }).click();
  await captain.getByRole("button", { name: "Accept invitation" }).click();
  await expect(captain).toHaveURL(/\/dashboard$/);
  await captain.goto("/captain");
  await captain.getByRole("button", { name: /CMS Marina → Ikorodu/ }).click();
  await expect(captain).toHaveURL(/\/captain\?trip=[0-9a-f-]{36}$/);

  const counter = captain.getByTestId("capacity-counter");
  for (const [name, seats] of [
    ["Ade", "2"],
    ["Bisi", "2"],
  ] as const) {
    await captain.getByLabel("Name").fill(name);
    await captain.getByLabel("Seats").fill(seats);
    await captain.getByRole("button", { name: "Add", exact: true }).click();
    await expect(captain.getByText(`${name} · ${seats}`)).toBeVisible();
  }
  await expect(counter).toHaveText("4 of 5");

  // Can't depart without the life-jacket check; then depart.
  await expect(captain.getByRole("button", { name: "Depart" })).toBeDisabled();
  await captain.getByRole("button", { name: /Life jackets checked/ }).click();
  await expect(captain.getByRole("button", { name: /☑ Life jackets checked/ })).toBeVisible();
  await captain.getByRole("button", { name: "Depart" }).click();
  await expect(captain.getByText(/The manifest is locked/)).toBeVisible();

  // A late passenger is an amendment; going over capacity is refused.
  await captain.getByLabel("Name").fill("Chika");
  await captain.getByLabel("Seats").fill("1");
  await captain.getByRole("button", { name: "Add", exact: true }).click();
  await expect(captain.getByText("Chika · 1")).toBeVisible();
  await expect(captain.getByText("Amendment", { exact: true })).toBeVisible();
  await expect(counter).toHaveText("5 of 5");
  await captain.getByLabel("Name").fill("Dayo");
  await captain.getByRole("button", { name: "Add", exact: true }).click();
  await expect(captain.getByText(/more people on board than the vessel is licensed for/)).toBeVisible();

  // Arrive with cash.
  await captain.getByLabel(/Cash collected/).fill("6000");
  await captain.getByRole("button", { name: "Arrived" }).click();
  await expect(captain.getByText("Trip closed.")).toBeVisible();
  // Saved on the phone first, then synced (M5).
  await expect(captain.getByText("Saved on phone")).toHaveCount(0);
  await expect(captain.getByText("Synced").first()).toBeVisible();
  await ctx.close();

  // Owner's daily report.
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/daily$/);
  await expect(page.getByTestId("total-passengers")).toHaveText("5");
  await expect(page.getByTestId("total-cash")).toContainText("6,000.00");
});
