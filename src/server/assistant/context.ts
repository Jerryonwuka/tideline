import "server-only";
import { localDate } from "@/lib/dates";
import { ServiceError } from "@/server/services/errors";
import type { Me } from "@/server/services/profile";
import type { AdminDb } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import type { runAssistant } from "./run";

/** Who may use the assistant: owners and managers (it reads org-wide figures). */
export const ASSISTANT_ROLES = ["owner", "manager"];

export async function assistantContext(
  db: Db | AdminDb,
  orgId: string,
  locale: string,
  channel: "app" | "whatsapp",
  now = new Date(),
): Promise<Parameters<typeof runAssistant>[0]> {
  const { data: org } = await db
    .from("orgs")
    .select("time_zone, currency, country_code, countries(name)")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) throw new ServiceError("not_found");
  return {
    db,
    orgId,
    timeZone: org.time_zone,
    currency: org.currency,
    locale,
    now,
    countryName: org.countries?.name ?? org.country_code,
    channel,
    today: localDate(now, org.time_zone),
  };
}

export function assertAssistantAccess(me: Me, orgId: string) {
  const m = me.memberships.find((x) => x.orgId === orgId && x.status === "active");
  if (!m || !ASSISTANT_ROLES.includes(m.role)) throw new ServiceError("forbidden");
}
