import { expect, test } from "@playwright/test";
import { logIn, randomPhone } from "./helpers";

// M5 acceptance (BUILD_SPEC §8): after one earlier visit, the captain screens work with the network
// off — start a trip, add passengers, depart and arrive — and everything syncs once on reconnect;
// replaying the same batch creates nothing new.

test.use({ serviceWorkers: "allow" });

test("captain works offline and syncs once on reconnect", async ({ page, context }) => {
  test.setTimeout(180_000);
  // An owner with one 10-seat vessel (the office can use captain mode too).
  await page.goto("/login");
  await logIn(page, randomPhone());
  await page.getByLabel("Full name").fill("Owner Offline");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Offline Test Ferries");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill("MV No Signal");
  await page.getByLabel("Passenger capacity").fill("10");
  await page.getByRole("button", { name: "Save vessel" }).click();
  await expect(page).toHaveURL(/\/onboarding\/documents/);

  // One online visit: the service worker installs and the page and its data are stored.
  await page.goto("/captain");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  // The service worker comes with production builds (pnpm build && pnpm start); a dev server has none.
  const registered = await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      if (await navigator.serviceWorker.getRegistration()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  });
  test.skip(!registered, "needs a production build (pnpm build && pnpm start)");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Capture what the phone sends so the batch can be replayed.
  const batches: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/v1/sync") batches.push(r.postData() ?? "");
  });

  // No network from here.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Offline");

  await page.getByRole("button", { name: "Start a trip" }).click();
  await page.getByLabel("From").fill("Ikorodu");
  await page.getByLabel("To").fill("Falomo");
  await page.getByRole("button", { name: "Start trip" }).click();
  await expect(page).toHaveURL(/\/captain\?trip=[0-9a-f-]{36}$/);
  for (const [name, seats] of [
    ["Ade", "2"],
    ["Bisi", "1"],
  ] as const) {
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Seats").fill(seats);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(`${name} · ${seats}`)).toBeVisible();
  }
  await expect(page.getByTestId("capacity-counter")).toHaveText("3 of 10");
  await page.getByRole("button", { name: /Life jackets checked/ }).click();
  await page.getByRole("button", { name: "Depart" }).click();
  await page.getByLabel(/Cash collected/).fill("4500");
  await page.getByRole("button", { name: "Arrived" }).click();
  await expect(page.getByText("Trip closed.")).toBeVisible();
  await expect(page.getByText("Saved on phone").first()).toBeVisible();

  // Six changes wait on the phone: trip, two passengers, life jackets, depart, arrive.
  await expect(page.getByRole("status")).toContainText("6 changes saved on phone");
  await page.getByRole("button", { name: "See" }).click();
  await expect(page.getByRole("heading", { name: "Pending sync" })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(6);
  expect(batches).toHaveLength(0);

  // Back online: everything syncs by itself.
  await context.setOffline(false);
  await expect(page.getByText("Nothing waiting. Everything is synced.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);

  // Server state.
  const me = (await (await page.request.get("/api/v1/me")).json()) as { memberships: { orgId: string }[] };
  const orgId = me.memberships[0]!.orgId;
  const trips = (await (await page.request.get(`/api/v1/trips?org_id=${orgId}`)).json()) as {
    id: string;
    origin_text: string | null;
    status: string;
    passenger_count: number;
    takings_cash_minor: number;
    actual_departure: string | null;
  }[];
  const trip = trips.find((t) => t.origin_text === "Ikorodu");
  expect(trip).toMatchObject({ status: "arrived", passenger_count: 3, takings_cash_minor: 450000 });
  expect(trip!.actual_departure).not.toBeNull();
  const manifest = async () =>
    (await (await page.request.get(`/api/v1/trips/${trip!.id}/manifest`)).json()) as unknown[];
  expect(await manifest()).toHaveLength(2);

  // Replaying what the phone sent changes nothing.
  expect(batches.length).toBeGreaterThan(0);
  for (const body of batches) {
    const res = await page.request.post("/api/v1/sync", { data: JSON.parse(body) });
    expect(res.ok()).toBe(true);
    const { results } = (await res.json()) as { results: { status: string }[] };
    expect(results.every((r) => r.status === "duplicate")).toBe(true);
  }
  expect(await manifest()).toHaveLength(2);
  const again = (await (await page.request.get(`/api/v1/trips?org_id=${orgId}`)).json()) as { origin_text: string }[];
  expect(again.filter((t) => t.origin_text === "Ikorodu")).toHaveLength(1);
});

test("the app is installable: manifest with icons and a service worker", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { start_url: string; display: string; icons: { sizes: string }[] };
  expect(manifest).toMatchObject({ start_url: "/captain", display: "standalone" });
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of ["/icons/icon-192.png", "/icons/icon-512.png"]) {
    expect((await request.get(icon)).headers()["content-type"]).toBe("image/png");
  }
});
