import { expect, test } from "@playwright/test";
import { logIn, randomPhone } from "./helpers";

// M7 acceptance: a test-mode card payment gives a paid ticket with a QR code; boarding by its code
// marks the passenger on the manifest; the same webhook twice changes state once. Payments go
// through the configured route (Paystack for NG/NGN) with the fake standing in locally.

test("passenger buys a ticket online, boards by code; agent sells for cash; owner pays a plan", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);

  // Owner: company, a 10-seat vessel, a route, and a trip started now.
  await page.goto("/login");
  await logIn(page, randomPhone());
  await page.getByLabel("Full name").fill("Owner Tickets");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Ticket Test Ferries");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill("MV Fare");
  await page.getByLabel("Passenger capacity").fill("10");
  await page.getByRole("button", { name: "Save vessel" }).click();
  await expect(page).toHaveURL(/\/onboarding\/documents/);
  await page.goto("/routes");
  await page.getByLabel("From", { exact: true }).selectOption({ label: "Falomo · Not yet verified" });
  await page.getByLabel("To", { exact: true }).selectOption({ label: "Badore · Not yet verified" });
  await page.getByLabel(/Base fare/).fill("1500");
  await page.getByRole("button", { name: "Save route" }).click();
  await expect(page.getByText("Falomo → Badore")).toBeVisible();
  await page.goto("/captain");
  await page.getByRole("button", { name: "Start a trip" }).click();
  await page.getByLabel("Route").selectOption({ label: "Falomo → Badore" });
  await page.getByRole("button", { name: "Start trip" }).click();
  await expect(page).toHaveURL(/\/captain\?trip=/);
  await expect(page.getByText("Saved on phone")).toHaveCount(0);
  const tripUrl = page.url();
  const me = (await (await page.request.get("/api/v1/me")).json()) as { memberships: { orgId: string }[] };
  const orgId = me.memberships[0]!.orgId;
  const trips = (await (await page.request.get(`/api/v1/trips?org_id=${orgId}`)).json()) as { id: string }[];
  const tripId = trips[0]!.id;

  // Passenger (not signed in): book two seats and pay with a test card.
  const ctx = await browser.newContext();
  const passenger = await ctx.newPage();
  await passenger.goto(`/book/${tripId}`);
  await expect(passenger.getByRole("heading", { name: "Falomo → Badore" })).toBeVisible();
  await passenger.getByLabel("Seats").fill("2");
  await passenger.getByLabel("Name on the ticket").fill("Funmi Ade");
  await passenger.getByLabel(/Phone/).fill("08031234567");
  // ₦1,500 × 2 + 1% booking fee (passenger bears it by default) = ₦3,030.00
  await expect(passenger.getByTestId("booking-total")).toHaveText(/3,030\.00/);
  await passenger.getByRole("button", { name: /Pay/ }).click();
  await expect(passenger.getByRole("heading", { name: "Test payment" })).toBeVisible();
  const reference = new URL(passenger.url()).searchParams.get("reference")!;
  await passenger.getByRole("button", { name: "Pay with test card" }).click();
  // A cold dev server compiles the ticket page (QR library) on first visit.
  await expect(passenger).toHaveURL(/\/tickets\/[A-Z0-9]{8}$/, { timeout: 60_000 });
  await expect(passenger.getByTestId("ticket-status")).toHaveText("Paid");
  await expect(passenger.locator("svg").first()).toBeVisible();
  const code = (await passenger.getByTestId("ticket-code").textContent())!.trim();
  await ctx.close();

  // The same signed webhook again (twice) changes nothing; a forged one is refused.
  const again = await page.request.post("/api/dev/payments/complete", { data: { reference } });
  const { status, webhook } = (await again.json()) as { status: string; webhook: { body: string; signature: string } };
  expect(status).toBe("duplicate");
  for (let i = 0; i < 2; i++) {
    const res = await page.request.post("/api/webhooks/payments/paystack", {
      headers: { "content-type": "application/json", "x-fake-signature": webhook.signature },
      data: webhook.body,
    });
    expect(await res.json()).toEqual({ status: "duplicate" });
  }
  const forged = await page.request.post("/api/webhooks/payments/paystack", {
    headers: { "content-type": "application/json", "x-fake-signature": "bad" },
    data: webhook.body.replace("evt_", "evt_forged_"),
  });
  expect(forged.status()).toBe(401);
  const manifest = async () =>
    (await (await page.request.get(`/api/v1/trips/${tripId}/manifest`)).json()) as {
      full_name: string;
      seats: number;
      boarded_at: string | null;
    }[];
  expect((await manifest()).filter((m) => m.full_name === "Funmi Ade")).toHaveLength(1);

  // At the jetty: board by code.
  await page.goto(tripUrl);
  await page.getByLabel("Ticket code").fill(code);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByText("Funmi Ade boarded (2 seats).")).toBeVisible();
  await page.getByLabel("Ticket code").fill(code);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByText("That ticket has already been used to board.")).toBeVisible();
  expect((await manifest()).find((m) => m.full_name === "Funmi Ade")?.boarded_at).not.toBeNull();

  // Office: an agent sale for cash goes straight onto the manifest.
  await page.goto(`/trips/${tripId}`);
  await page.getByLabel("Passenger name").fill("Tunde Cash");
  await page.getByLabel("Seats").fill("1");
  await page.getByRole("button", { name: "Record sale" }).click();
  await expect(page.getByText(/Sold\. Ticket code [A-Z0-9]{8}\./)).toBeVisible();
  expect((await manifest()).map((m) => m.full_name).sort()).toEqual(["Funmi Ade", "Tunde Cash"]);

  // Billing: pay a month of Ferry Basic in the org's currency.
  await page.getByRole("link", { name: "Billing", exact: true }).click();
  await expect(page).toHaveURL(/\/billing$/);
  const basic = page.getByTestId("plan-ferry_basic");
  await expect(basic).toContainText("30,000");
  await basic.getByRole("button", { name: "Pay for a month" }).click();
  await page.getByRole("button", { name: "Pay with test card" }).click();
  await expect(page.getByText("Payment received. Thank you.")).toBeVisible();
  await expect(page.getByTestId("plan-ferry_basic").getByTestId("subscription-status")).toContainText("Active until");
});
