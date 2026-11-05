import { expect, test } from "@playwright/test";
import { logIn, outbox, randomPhone } from "./helpers";

// M11 acceptance: a charterer finds a listing, sends a request, receives a quote and accepts it;
// the owner sees the request in the app and on WhatsApp; the public API shows no private documents.

test("charterer requests a listed vessel, the owner quotes, the charterer accepts", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const ownerPhone = randomPhone();
  // Unique per run: parallel projects and earlier runs leave listings on the shared board.
  const vesselName = `MV Delta Star ${ownerPhone.slice(-5)}`;

  // Owner: a vessel-owner company in charter mode with a charter-enabled OSV.
  await page.goto("/login");
  await logIn(page, ownerPhone);
  await page.getByLabel("Full name").fill("Owner Charter");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Delta Marine Services");
  await page.getByRole("radio", { name: "Vessel owner" }).check();
  await page.getByRole("checkbox", { name: "Ferry" }).uncheck();
  await page.getByRole("checkbox", { name: "Charter" }).check();
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill(vesselName);
  await page.getByLabel("Type").selectOption({ label: "Offshore supply vessel" });
  await page.getByRole("button", { name: "Save vessel" }).click();
  await expect(page).toHaveURL(/\/onboarding\/documents/);

  // A private document that must never be public.
  const me = (await (await page.request.get("/api/v1/me")).json()) as { memberships: { orgId: string }[] };
  const ownerOrg = me.memberships[0]!.orgId;
  const vessels = (await (await page.request.get(`/api/v1/vessels?org_id=${ownerOrg}`)).json()) as { id: string }[];
  const privateDoc = await page.request.post("/api/v1/documents", {
    data: {
      orgId: ownerOrg,
      subjectType: "vessel",
      subjectId: vessels[0]!.id,
      documentTypeCode: "insurance",
      number: "POLICY-PRIVATE-42",
      expiryDate: "2027-12-31",
    },
  });
  expect(privateDoc.ok()).toBe(true);

  // List it on the board.
  await page.goto("/charters");
  await page.locator("#dayRate").fill("1500000");
  await page.getByLabel("Operating area").fill("Bonny and Onne");
  await page.getByLabel("Minimum days").fill("2");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Charterer: signs up as a charterer company and finds it.
  const ctx = await browser.newContext();
  const charterer = await ctx.newPage();
  await charterer.goto("/login");
  await logIn(charterer, randomPhone());
  await charterer.getByLabel("Full name").fill("Ada Charterer");
  await charterer.getByRole("button", { name: "Continue" }).click();
  await charterer.getByLabel("Company name").fill("Gulf Energy Ltd");
  await charterer.getByRole("radio", { name: "Charterer" }).check();
  await charterer.getByRole("button", { name: "Create company" }).click();
  await expect(charterer).toHaveURL(/\/board$/);
  await charterer.getByLabel("Area").fill("Bonny");
  await charterer.getByRole("button", { name: "Search" }).click();
  await charterer.getByRole("link", { name: new RegExp(vesselName) }).click();
  await expect(charterer).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  await expect(charterer.getByText("Not yet verified")).toBeVisible();
  const listingId = charterer.url().split("/").pop()!;

  // The public API never shows the private document.
  const publicJson = await (await charterer.request.get(`/api/public/board/${listingId}`)).text();
  expect(publicJson).not.toContain("POLICY-PRIVATE-42");
  expect(publicJson).not.toContain("insurance");

  await charterer.locator("#startDate").fill("2026-12-01");
  await charterer.locator("#endDate").fill("2026-12-05");
  await charterer.getByLabel("Location").fill("Bonny terminal");
  await charterer.getByLabel("Purpose").fill("Crew change and supplies");
  await charterer.getByRole("button", { name: "Send request" }).click();
  await expect(charterer.getByText("Request sent.")).toBeVisible();

  // Owner: told on WhatsApp, sees it in the app, sends a quote.
  await expect
    .poll(async () =>
      (await outbox(page.request, ownerPhone)).messages.some((m) =>
        m.text?.includes("New charter request: Bonny terminal"),
      ),
    )
    .toBe(true);
  await page.goto("/charters/requests");
  const request = page.getByTestId("charter-request").first();
  await expect(request).toContainText("Bonny terminal");
  await expect(request).toContainText("Gulf Energy Ltd");
  await request.getByLabel(/Day rate/).fill("1400000");
  await request.getByLabel("Mobilisation fee").fill("500000");
  await request.getByRole("button", { name: "Send quote" }).click();
  await expect(page.getByTestId("charter-quote").first()).toContainText("Waiting for reply");

  // Charterer accepts.
  await charterer.goto("/charters/requests");
  const quote = charterer.getByTestId("charter-quote").first();
  await expect(quote).toContainText(vesselName);
  await quote.getByRole("button", { name: "Accept" }).click();
  await expect(charterer.getByText("Accepted. A charter was created")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("charter-quote").first()).toContainText("Accepted");

  // M12: the owner creates the contract; both sides accept it; the PDF is stored.
  await page.goto("/charters");
  await page
    .getByTestId("charters-list")
    .getByRole("link", { name: new RegExp(vesselName) })
    .click();
  await expect(page).toHaveURL(/\/charters\/[0-9a-f-]{36}$/);
  const charterUrl = page.url();
  await page.getByRole("button", { name: "Create contract" }).click();
  await expect(page.getByTestId("contract-body")).toContainText("Gulf Energy Ltd");
  await expect(page.getByTestId("contract-body")).toContainText("1,400,000.00 per day");
  await page.getByLabel("Full name").fill("Owner Charter");
  await page.getByRole("button", { name: "Accept contract" }).click();
  await expect(page.getByTestId("contract-acceptance")).toContainText("Owner accepted: Owner Charter");

  await charterer.goto(new URL(charterUrl).pathname);
  await expect(charterer.getByTestId("contract-acceptance")).toContainText("Waiting for the charterer");
  await charterer.getByLabel("Full name").fill("Ada Charterer");
  await charterer.getByRole("button", { name: "Accept contract" }).click();
  await expect(charterer.getByText("Both parties have accepted. Next: payment.")).toBeVisible();
  const pdf = await charterer.getByTestId("contract-pdf").getAttribute("href");
  const file = await charterer.request.get(pdf!);
  expect(file.headers()["content-type"]).toContain("application/pdf");

  // M13 (F6): the charterer pays into escrow; ₦1,400,000 × 5 days + ₦500,000 mobilisation.
  await charterer.getByRole("button", { name: /Pay .*7,500,000\.00 into escrow/ }).click();
  await charterer.getByRole("button", { name: "Pay with test card" }).click();
  await expect(charterer).toHaveURL(/\/charters\/[0-9a-f-]{36}$/);
  await expect(charterer.getByTestId("escrow-held")).toContainText("Held");

  // The owner adds a payout account (only the last 4 digits are kept).
  await page.goto("/payouts");
  await page.getByLabel("Bank code").fill("058");
  await page.getByLabel("Account number").fill("0123456789");
  await page.getByLabel("Account name").fill("Delta Marine Services Ltd");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByTestId("bank-accounts")).toContainText("****6789");
  await expect(page.getByTestId("bank-accounts")).not.toContainText("0123456789");

  // Both confirm on-hire: the mobilisation is released, minus 4% commission (5% − 1% in-app).
  await page.goto(charterUrl);
  await page.getByRole("button", { name: "Confirm on-hire" }).click();
  await expect(page.getByText("You’ve confirmed. Waiting for the other side.")).toBeVisible();
  await charterer.reload();
  await charterer.getByRole("button", { name: "Confirm on-hire" }).click();
  await expect(charterer.getByTestId("escrow-release").first()).toContainText("480,000.00");
  await expect(charterer.getByTestId("escrow-release").first()).toContainText("Commission");

  // The provider confirms the transfer; the payout shows as paid out.
  await page.goto("/payouts");
  await expect(page.getByTestId("payouts")).toContainText("Payout pending");
  const payouts = (await (await page.request.get(`/api/v1/payouts?org_id=${ownerOrg}`)).json()) as {
    provider_transfer_ref: string;
  }[];
  expect(payouts).toHaveLength(1);
  const done = await page.request.post("/api/dev/payments/transfer", {
    data: { ref: payouts[0]!.provider_transfer_ref },
  });
  expect(done.ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("payouts")).toContainText("Paid out");

  // Both confirm off-hire: the rest is released and the charter completes.
  await page.goto(charterUrl);
  await page.getByRole("button", { name: "Confirm off-hire" }).click();
  await charterer.reload();
  await charterer.getByRole("button", { name: "Confirm off-hire" }).click();
  await expect(charterer.getByTestId("escrow-panel")).toContainText("Released");
  await expect(charterer.getByTestId("escrow-release")).toHaveCount(2);
  await ctx.close();
});
