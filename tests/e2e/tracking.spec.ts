import { expect, test } from "@playwright/test";
import { logIn, randomPhone } from "./helpers";

// M8 acceptance: points recorded offline upload in order on reconnect; the owner's map shows a new
// position within 60 s; the public status page has no personal data. The browser clock is
// controlled so 30-second GPS samples don't take real minutes.

const A = { latitude: 6.4474, longitude: 3.4281 };
const B = { latitude: 6.4602, longitude: 3.4655 };
const C = { latitude: 6.4791, longitude: 3.5102 };
const D = { latitude: 6.495, longitude: 3.56 };

test("captain's GPS is tracked offline and online; owner sees the map, track and public status", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const ownerPhone = randomPhone();

  // Midday in Lagos on both clocks, so the safety check passes whenever this runs.
  const lagosDate = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const midday = new Date(`${lagosDate}T11:00:00Z`);
  await page.clock.install({ time: midday });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(A);

  await page.goto("/login");
  await logIn(page, ownerPhone);
  await page.getByLabel("Full name").fill("Owner Tracker");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Tracking Test Ferries");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill("MV Beacon");
  await page.getByLabel("Passenger capacity").fill("10");
  await page.getByRole("button", { name: "Save vessel" }).click();
  await expect(page).toHaveURL(/\/onboarding\/documents/);
  expect((await page.request.post("/api/dev/clock", { data: { at: midday.toISOString() } })).ok()).toBe(true);
  await page.goto("/routes");
  await page.getByLabel("From", { exact: true }).selectOption({ label: "Falomo · Not yet verified" });
  await page.getByLabel("To", { exact: true }).selectOption({ label: "Badore · Not yet verified" });
  await page.getByLabel(/Base fare/).fill("1500");
  await page.getByRole("button", { name: "Save route" }).click();
  await expect(page.getByText("Falomo → Badore")).toBeVisible();

  // Captain mode: start, board one passenger, check and depart.
  await page.goto("/captain");
  await page.getByRole("button", { name: "Start a trip" }).click();
  await page.getByLabel("Route").selectOption({ label: "Falomo → Badore" });
  await page.getByRole("button", { name: "Start trip" }).click();
  await page.getByLabel("Name").fill("Ngozi Passenger");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: /Life jackets checked/ }).click();
  await page.getByRole("button", { name: "Run safety check" }).click();
  await expect(page.getByTestId("safety-result")).toHaveText("Safe to depart");
  await page.getByRole("button", { name: "Depart", exact: true }).click();
  await expect(page.getByTestId("tracking-state")).toContainText("Tracking");
  const me = (await (await page.request.get("/api/v1/me")).json()) as { memberships: { orgId: string }[] };
  const orgId = me.memberships[0]!.orgId;
  const trips = (await (await page.request.get(`/api/v1/trips?org_id=${orgId}`)).json()) as { id: string }[];
  const tripId = trips[0]!.id;
  const track = async () =>
    (await (await page.request.get(`/api/v1/trips/${tripId}/positions`)).json()) as { lat: number; lng: number }[];
  // The first fix is recorded straight away and uploads (online).
  await expect.poll(async () => (await track()).length).toBe(1);

  // No signal: two more samples, 30 s apart, wait on the phone.
  await context.setOffline(true);
  await context.setGeolocation(B);
  await page.clock.fastForward(31_000);
  await context.setGeolocation(C);
  await page.clock.fastForward(31_000);
  await expect(page.getByTestId("tracking-state")).toContainText("2 points waiting");

  // Back online: they upload, in order.
  await context.setOffline(false);
  await expect(page.getByTestId("tracking-state")).not.toContainText("waiting");
  expect((await track()).map((p) => p.lat)).toEqual([A.latitude, B.latitude, C.latitude]);

  // Owner's live map: the latest position, then a new one within a minute.
  const map = await context.newPage();
  await map.goto("/map");
  await expect(map.getByTestId("fleet-list")).toContainText("MV Beacon");
  await expect(map.getByTestId("last-seen")).toContainText(`${C.latitude.toFixed(4)}, ${C.longitude.toFixed(4)}`);
  await context.setGeolocation(D);
  await page.clock.fastForward(31_000);
  await expect.poll(async () => (await track()).length).toBe(4);
  await map.clock.fastForward(16_000);
  await expect(map.getByTestId("last-seen")).toContainText(`${D.latitude.toFixed(4)}, ${D.longitude.toFixed(4)}`);

  // Track replay on the trip page.
  await map.goto(`/trips/${tripId}`);
  await expect(map.getByTestId("track-replay")).toContainText("4 points");

  // Public status page: the trip, no personal data.
  const anon = await (await context.browser()!.newContext()).newPage();
  await anon.goto(`/status/${tripId}`);
  const status = anon.getByTestId("public-status");
  await expect(status).toContainText("Departed");
  await expect(status).toContainText("Expected about");
  const text = await anon.locator("body").innerText();
  for (const personal of ["Ngozi", "Owner Tracker", ownerPhone, ownerPhone.slice(1)])
    expect(text).not.toContain(personal);
  expect(text).not.toContain(C.latitude.toFixed(3));
  await anon.context().close();
});
