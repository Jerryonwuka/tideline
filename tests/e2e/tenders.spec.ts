import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { logIn, randomPhone } from "./helpers";

// M14 acceptance: an owner pastes a tender, gets a checklist that quotes the tender, sees their
// documents mapped (green/amber/red), drafts sections from stored facts, fixes the [MISSING]
// markers, reviews, and exports a merged PDF with an index (or submits anyway, recorded).

const TENDER = readFileSync("tests/fixtures/tender-crew-boat.txt", "utf8");

test("owner builds and exports a tender pack", async ({ page }) => {
  test.setTimeout(180_000);
  const phone = randomPhone();
  const vesselName = `MV Bonny Runner ${phone.slice(-5)}`;

  await page.goto("/login");
  await logIn(page, phone);
  await page.getByLabel("Full name").fill("Tender Owner");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Bonny Crew Boats Ltd");
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
  const vessels = (await (await page.request.get(`/api/v1/vessels?org_id=${orgId}`)).json()) as { id: string }[];
  const vesselId = vessels[0]!.id;
  // Insurance valid past the deadline (green); class certificate expiring before it (amber).
  for (const [code, expiry] of [
    ["insurance", "2028-06-30"],
    ["class_certificate", "2027-01-15"],
  ] as const) {
    const res = await page.request.post("/api/v1/documents", {
      data: { orgId, subjectType: "vessel", subjectId: vesselId, documentTypeCode: code, expiryDate: expiry },
    });
    expect(res.ok()).toBe(true);
  }

  await page.goto("/tenders/new");
  await page.getByLabel("Tender title").fill("Crew boat hire, Bonny");
  await page.getByLabel("Tender text").fill(TENDER);
  await page.getByRole("button", { name: "Read tender" }).click();
  await expect(page).toHaveURL(/\/tenders\/[0-9a-f-]{36}$/);

  // Every checklist item quotes the tender.
  const items = page.getByTestId("tender-item");
  await expect(items.first()).toBeVisible();
  for (const quote of await page.getByTestId("tender-checklist").locator("blockquote").allTextContents()) {
    expect(TENDER).toContain(quote.replace(/^“|”$/g, ""));
  }

  // Map documents for the vessel.
  await page.getByRole("checkbox", { name: vesselName }).check();
  await page.getByRole("button", { name: "Match documents" }).click();
  const row = (text: string) => items.filter({ has: page.locator("blockquote", { hasText: text }) });
  await expect(row("hull and machinery insurance")).toHaveAttribute("data-status", "valid");
  await expect(row("class certificate")).toHaveAttribute("data-status", "expires_before_deadline");
  await expect(row("radio licence")).toHaveAttribute("data-status", "missing");

  // Draft from stored facts; gaps are marked, never invented.
  await page.getByRole("button", { name: "Draft sections" }).click();
  const company = page.getByTestId("section-company_profile");
  await expect(company.locator("textarea")).toContainText("Bonny Crew Boats Ltd");
  await expect(company.locator("textarea")).toContainText("[MISSING:");

  // Export is held until the markers are gone and the red mandatory items are handled.
  await page.getByRole("button", { name: "I’ve reviewed this pack" }).click();
  await expect(page.getByTestId("tender-export")).toContainText("Reviewed");
  await page.getByRole("button", { name: "Export pack" }).click();
  await expect(page.getByTestId("tender-export")).toContainText("Fill the [MISSING] items");

  // Replace every marker, then accept the open documents with "Submit anyway".
  for (const section of ["cover_letter", "company_profile", "vessel_specification", "hse_statement"]) {
    const editor = page.getByTestId(`section-${section}`);
    const box = editor.locator("textarea");
    await box.fill((await box.inputValue()).replace(/\[MISSING:[^\]]*\]/g, "To be confirmed"));
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor.getByText("Saved.")).toBeVisible();
  }
  await page.reload();
  await expect(page.getByTestId("tender-held")).not.toContainText("[MISSING] marker");
  await page.getByRole("checkbox", { name: /Submit anyway/ }).check();
  await expect(page.getByText("This choice is recorded.")).toBeVisible();
  // Editing reset the review.
  await page.getByRole("button", { name: "I’ve reviewed this pack" }).click();
  await page.getByRole("button", { name: "Export pack" }).click();

  const pdfHref = await page.getByTestId("tender-pdf").getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const zip = await page.request.get((await page.getByTestId("tender-zip").getAttribute("href"))!);
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");
});
