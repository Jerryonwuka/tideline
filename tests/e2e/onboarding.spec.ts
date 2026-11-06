import { expect, test } from "@playwright/test";
import { logIn, outbox, randomPhone, openNav } from "./helpers";

// M1 acceptance: a new user signs up by OTP, creates an org and invites a captain by phone; the
// captain accepts and logs in. Needs local Supabase (pnpm db:start) and the fake integrations.

test("owner signs up, creates an org and invites a captain who joins", async ({ page, browser }) => {
  test.slow();
  const ownerPhone = randomPhone();
  const captainPhone = randomPhone();

  // Owner: OTP sign-up → name → company → dashboard.
  await page.goto("/login");
  await logIn(page, ownerPhone);
  await expect(page).toHaveURL(/\/onboarding\/profile/);
  await page.getByLabel("Full name").fill("Ada Okafor");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Company name").fill("Lagoon Test Ferries");
  await expect(page.getByText(/Prices in NGN · times in Africa\/Lagos/)).toBeVisible();
  await page.getByRole("button", { name: "Create company" }).click();
  // Steps 3–5 (vessel, document, captain) can be skipped.
  await expect(page).toHaveURL(/\/onboarding\/vessel$/);
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/onboarding\/invite$/);
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome, Ada Okafor" })).toBeVisible();
  // The company form showed the country's defaults before submitting.

  // Invite a captain.
  await openNav(page);
  await page.getByRole("link", { name: "Team" }).click();
  const inviteForm = page.getByRole("region", { name: "Invite someone" });
  await inviteForm.getByLabel("Phone number").fill(captainPhone);
  await inviteForm.getByLabel("Role").selectOption("captain");
  await inviteForm.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByRole("status")).toContainText("Invite sent");
  await expect(page.getByText("Pending invitations")).toBeVisible();

  const invite = (await outbox(page.request, captainPhone)).messages.find((m) => m.channel === "whatsapp");
  const link = invite?.params?.[3];
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);

  // Captain: open the link signed out → log in with their own number → name → accept.
  const captainContext = await browser.newContext();
  const captain = await captainContext.newPage();
  await captain.goto(new URL(link!).pathname);
  await expect(captain.getByText("Join Lagoon Test Ferries on Tideline as Captain.")).toBeVisible();
  await captain.getByRole("link", { name: "Log in to accept" }).click();
  await logIn(captain, captainPhone);
  await expect(captain).toHaveURL(/\/onboarding\/profile/);
  await captain.getByLabel("Full name").fill("Tunde Adeyemi");
  await captain.getByRole("button", { name: "Continue" }).click();
  await expect(captain).toHaveURL(/\/invite\//);
  await captain.getByRole("button", { name: "Accept invitation" }).click();
  await expect(captain).toHaveURL(/\/dashboard$/);
  await expect(captain.getByText("as Captain")).toBeVisible();
  // Captains don't manage the team.
  await openNav(captain);
  await expect(captain.getByRole("link", { name: "Team" })).toHaveCount(0);
  await captainContext.close();

  // Owner sees the captain in the team.
  await page.reload();
  await expect(page.getByRole("cell", { name: "Tunde Adeyemi" })).toBeVisible();
});
