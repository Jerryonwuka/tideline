import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { logIn, makePng, randomPhone } from "./helpers";

// M3 acceptance: uploading a certificate creates an ai_job and a draft with extracted fields;
// nothing becomes valid until confirmed; low-confidence fields are highlighted. (Local dev uses
// the fake extractor, which returns a plausible draft with a low-confidence issuer and issue date.)

test("a photo without dates is read into a draft that only counts once confirmed", async ({ page }) => {
  test.slow();
  await page.goto("/login");
  await logIn(page, randomPhone());
  await page.getByLabel("Full name").fill("Review Tester");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Review Test Co");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Vessel name").fill("MV Draft");
  await page.getByRole("button", { name: "Save vessel" }).click();

  await expect(page).toHaveURL(/\/onboarding\/documents/);
  await page.getByLabel("Document type").selectOption("insurance");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "cert.png", mimeType: "image/png", buffer: makePng(800, 600) });
  // No dates typed: the document goes to review with an AI draft.
  await page.getByRole("button", { name: "Save document" }).click();
  await expect(page).toHaveURL(/\/onboarding\/invite$/);

  await page.goto("/documents?status=needs_review");
  await page.getByRole("link", { name: "Insurance" }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Needs review", { exact: true })).toBeVisible();
  await expect(page.getByText("Read from the photo")).toBeVisible();
  // Prefilled from the draft; unsure fields are flagged for the reviewer.
  await expect(page.getByLabel(/Certificate number/)).toHaveValue(/^DEV-/);
  await expect(page.locator('input[name="issuer"]')).toHaveAttribute("data-low-confidence", "true");
  await expect(page.locator('input[name="issueDate"]')).toHaveAttribute("data-low-confidence", "true");
  await expect(page.locator('input[name="expiryDate"]')).not.toHaveAttribute("data-low-confidence", "true");

  const docId = page.url().split("/").pop()!;
  const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", {
    max: 1,
  });
  try {
    const jobs =
      await sql`select kind, status, prompt_version from public.ai_jobs where input_ref = ${`document:${docId}`}`;
    expect(jobs).toEqual([{ kind: "ocr_extract", status: "done", prompt_version: "ocr-extract@1" }]);
    const [doc] = await sql`select status, expiry_date from public.documents where id = ${docId}`;
    expect(doc).toMatchObject({ status: "needs_review", expiry_date: null });
  } finally {
    await sql.end();
  }

  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  await expect(page.getByText("Read from the photo")).toHaveCount(0);
});
