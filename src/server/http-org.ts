import "server-only";
import { z } from "zod";

/** REST callers name the org explicitly (?org_id= or body.orgId); RLS decides whether they may. */
export function orgIdFrom(request: Request): string {
  return z.uuid().parse(new URL(request.url).searchParams.get("org_id"));
}
