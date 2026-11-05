import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Scheduled jobs authenticate with `Authorization: Bearer <CRON_SECRET>`. */
export function isAuthorisedJob(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret === "change-me" || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
