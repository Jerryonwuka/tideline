import { createHmac } from "node:crypto";

/**
 * Stable, non-reversible id for a phone number, for logs, analytics and wa_messages.phone_hash.
 * Never log the raw number (CLAUDE.md rule 10).
 */
export function hashPhone(phoneE164: string, salt = process.env.PHONE_HASH_SALT ?? "dev-only-salt"): string {
  return createHmac("sha256", salt).update(phoneE164).digest("hex").slice(0, 16);
}
