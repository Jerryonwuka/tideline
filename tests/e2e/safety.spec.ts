import { expect, test } from "@playwright/test";
import { logIn, pinMidday, randomPhone } from "./helpers";

// M6 acceptance (BUILD_SPEC §4.2, F2): a blocked departure is impossible in the UI and the API until
// the owner approves an override; limits can only be tightened. The fake forecast is calm (wind
// 10 km/h), so tightening the wind limit to 5 km/h produces a block.

test("a blocked trip departs only after the owner approves an override", async ({ page }) => {
  test.setTimeout(180_000);
  await pinMidday(page);

  await page.goto("/login");
  await logIn(page, randomPhone());
  await page.getByLabel("Full name").fill("Owner Safety");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Safety Test Ferries");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill("MV Careful");
  await page.getByLabel("Passenger capacity").fill("8");
  await page.getByRole("button", { name: "Save vessel" }).click();
  await expect(page).toHaveURL(/\/onboarding\/documents/);

  // A route, so the trip has a place for weather and daylight.
  await page.goto("/routes");
  await page.getByLabel("From", { exact: true }).selectOption({ label: "CMS Marina · Not yet verified" });
  await page.getByLabel("To", { exact: true }).selectOption({ label: "Ikorodu · Not yet verified" });
  await page.getByLabel(/Base fare/).fill("1500");
  await page.getByRole("button", { name: "Save route" }).click();
  await expect(page.getByText("CMS Marina → Ikorodu")).toBeVisible();

  // Limits: looser than the defaults is refused; stricter is saved.
  await page.getByRole("link", { name: "Safety", exact: true }).click();
  await expect(page).toHaveURL(/\/safety$/);
  await page.getByLabel("Max wind (km/h)").fill("80");
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Limits can only be stricter than the country defaults.")).toBeVisible();
  await page.getByLabel("Max wind (km/h)").fill("5");
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Captain mode: start the trip, board, check.
  await page.goto("/captain");
  await page.getByRole("button", { name: "Start a trip" }).click();
  await page.getByRole("button", { name: "Start trip" }).click();
  await expect(page).toHaveURL(/\/captain\?trip=[0-9a-f-]{36}$/);
  await page.getByLabel("Name").fill("Ngozi");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Ngozi · 1")).toBeVisible();
  await page.getByRole("button", { name: /Life jackets checked/ }).click();
  await page.getByRole("button", { name: "Run safety check" }).click();
  await expect(page.getByTestId("safety-result")).toHaveText("Departure blocked");
  await expect(page.getByText("Wind 10 km/h is over the 5 km/h limit.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Depart", exact: true })).toBeDisabled();

  // The API refuses too, once the server has the check.
  await expect(page.getByText("Saved on phone")).toHaveCount(0);
  const me = (await (await page.request.get("/api/v1/me")).json()) as { memberships: { orgId: string }[] };
  const orgId = me.memberships[0]!.orgId;
  const trips = (await (await page.request.get(`/api/v1/trips?org_id=${orgId}`)).json()) as { id: string }[];
  const tripId = trips[0]!.id;
  const refused = await page.request.post(`/api/v1/trips/${tripId}/depart`);
  expect(refused.status()).toBe(409);
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("safety_blocked");

  // Ask for an override.
  await page.getByLabel("Note for the owner (optional)").fill("Sheltered lagoon crossing");
  await page.getByRole("button", { name: "Ask the owner to override" }).click();
  await expect(page.getByText("Waiting for the owner’s decision.")).toBeVisible();
  const tripUrl = page.url();

  // The owner approves, with a reason.
  await page.goto("/safety");
  const request = page.getByTestId("override-request");
  await expect(request).toContainText("Wind 10 km/h is over the 5 km/h limit.");
  await expect(request).toContainText("Sheltered lagoon crossing");
  await request.getByLabel("Your reason").fill("Checked with the jetty master");
  await request.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("No requests waiting.")).toBeVisible();

  // Back on the boat: approved, and the trip departs.
  await page.goto(tripUrl);
  await expect(page.getByText("Override approved: Checked with the jetty master")).toBeVisible();
  await page.getByRole("button", { name: "Depart", exact: true }).click();
  await expect(page.getByText(/The manifest is locked/)).toBeVisible();
  await expect(page.getByText("Saved on phone")).toHaveCount(0);
  const trip = (await (await page.request.get(`/api/v1/trips/${tripId}`)).json()) as { status: string };
  expect(trip.status).toBe("departed");

  // The office sees the checks and the decision on the trip.
  await page.goto(`/trips/${tripId}`);
  await expect(page.getByRole("heading", { name: "Safety checks" })).toBeVisible();
  await expect(page.getByText("Override approved: Checked with the jetty master")).toBeVisible();
});
