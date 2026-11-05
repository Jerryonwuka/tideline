import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Standard Webhooks signature (used by Supabase Auth hooks).
 * Secret format: "v1,whsec_<base64 key>". Signed content: "<id>.<timestamp>.<body>".
 */
export function verifyStandardWebhook(
  secret: string,
  headers: Headers,
  rawBody: string,
  now: Date = new Date(),
  toleranceSec = 300,
): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now.getTime() / 1000 - ts) > toleranceSec) return false;

  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  return signatures.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Builds headers for a signed payload; used by tests and local tooling. */
export function signStandardWebhook(secret: string, id: string, timestamp: number, rawBody: string): Headers {
  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return new Headers({ "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": `v1,${sig}` });
}
