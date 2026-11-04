import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// M1 acceptance: a new user signs up by OTP, creates an org and invites a captain by phone; the
// captain accepts and logs in. Needs local Supabase (pnpm db:start) and the fake integrations.

const randomPhone = () => `0803${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
const e164 = (local: string) => `+234${local.slice(1)}`;

async function outbox(request: APIRequestContext, phone: string) {
  const res = await request.get(`/api/dev/outbox?phone=${encodeURIComponent(e164(phone))}`);
  expect(res.ok(), "dev outbox must be enabled (APP_ENV=local, INTEGRATIONS_MODE=fake)").toBe(true);
  return (await res.json()) as { otps: string[]; messages: { channel: string; text?: string; params?: string[] }[] };
}

async function logIn(page: Page, phone: string) {
  const before = (await outbox(page.request, phone)).otps.length;
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  let code = "";
  await expect
    .poll(async () => {
      const { otps } = await outbox(page.request, phone);
      code = otps[otps.length - 1] ?? "";
      return otps.length;
    })
    .toBeGreaterThan(before);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Log in" }).click();
}

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
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome, Ada Okafor" })).toBeVisible();

  // Invite a captain.
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
  await expect(captain.getByRole("link", { name: "Team" })).toHaveCount(0);
  await captainContext.close();

  // Owner sees the captain in the team.
  await page.reload();
  await expect(page.getByRole("cell", { name: "Tunde Adeyemi" })).toBeVisible();
});
