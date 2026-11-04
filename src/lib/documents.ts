import type { DocumentStatus } from "./schemas/fleet";

export const EXPIRING_WINDOW_DAYS = 30;

/**
 * Same rule as public.effective_document_status(): a human decision (needs review, rejected) wins;
 * otherwise the calendar decides, as of today in the org's time zone.
 */
export function effectiveStatus(
  stored: DocumentStatus,
  expiryDate: string | null,
  today: string,
  expiringWindowDays = EXPIRING_WINDOW_DAYS,
): DocumentStatus {
  if (stored === "needs_review" || stored === "rejected") return stored;
  if (!expiryDate) return "valid";
  if (expiryDate < today) return "expired";
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + expiringWindowDays * 86_400_000).toISOString().slice(0, 10);
  return expiryDate <= limit ? "expiring" : "valid";
}

/** Issue date must not be after expiry; both are calendar dates (YYYY-MM-DD). */
export function datesInOrder(issueDate?: string, expiryDate?: string): boolean {
  return !issueDate || !expiryDate || issueDate <= expiryDate;
}
