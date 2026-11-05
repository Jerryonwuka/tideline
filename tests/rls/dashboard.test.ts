import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localDate } from "@/lib/dates";
import { askAssistant } from "@/server/assistant/run";
import { assistantContext } from "@/server/assistant/context";
import { FORBIDDEN_CAPABILITIES, TOOLS } from "@/server/assistant/tools";
import { createFakeIntegrations, setIntegrationsForTesting } from "@/server/integrations";
import { devAssistant } from "@/server/integrations/llm/dev-assistant";
import type { FakeLlmClient } from "@/server/integrations/llm/fake";
import type { ChatRequest } from "@/server/integrations/llm/types";
import { dashboardSummary, weekStart, weeklyReport } from "@/server/services/dashboard";
import { supabaseAdmin } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { sql } from "./helpers";

// Dashboard and weekly figures against the database's own totals, and the assistant answering
// from tool results (M10 acceptance). Committed rows, cleaned up after.
config({ path: [".env.local", ".env"], quiet: true });

const ZONE = "Africa/Lagos";
const created = { orgs: [] as string[], users: [] as string[] };
let orgId = "";
let vesselIds: string[] = [];
let llm: FakeLlmClient;

beforeAll(async () => {
  const fakes = createFakeIntegrations();
  llm = fakes.llm as FakeLlmClient;
  setIntegrationsForTesting(fakes);

  const owner = randomUUID();
  await sql`insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
            values (${owner}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())`;
  created.users.push(owner);
  const [o] =
    await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
                        values ('Dashboard Ferries', 'ferry_operator', 'NG', 'NGN', ${ZONE}, 'en', 'af', '{ferry}') returning id`;
  orgId = o!.id as string;
  created.orgs.push(orgId);
  await sql`insert into public.memberships (user_id, org_id, role) values (${owner}, ${orgId}, 'owner')`;
  vesselIds = [];
  for (const name of ["MV Busy", "MV Quiet"]) {
    const [v] =
      await sql`insert into public.vessels (org_id, name, type, operating_country_code, passenger_capacity, ferry_enabled)
                          values (${orgId}, ${name}, 'ferry', 'NG', 50, true) returning id`;
    vesselIds.push(v!.id as string);
  }
  // Today: two arrived trips with takings, one cancelled (excluded).
  for (const [status, pax, cash, digital] of [
    ["arrived", 12, 1800000, 300000],
    ["arrived", 7, 1050000, 0],
    ["cancelled", 0, 0, 0],
  ] as const) {
    await sql`insert into public.trips (org_id, vessel_id, origin_text, destination_text, currency, status, passenger_count, takings_cash_minor, takings_digital_minor, scheduled_departure)
              values (${orgId}, ${vesselIds[0]!}, 'A', 'B', 'NGN', ${status}, ${pax}, ${cash}, ${digital}, now())`;
  }
  await sql`insert into public.expenses (org_id, vessel_id, category, amount_minor, currency, source) values
            (${orgId}, ${vesselIds[0]!}, 'fuel', 400000, 'NGN', 'app'), (${orgId}, ${vesselIds[0]!}, 'levy', 50000, 'NGN', 'app')`;
  const today = localDate(new Date(), ZONE);
  const monthEnd = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const inMonth = monthEnd.toISOString().slice(0, 10);
  await sql`insert into public.documents (org_id, subject_type, subject_id, document_type_code, expiry_date, status) values
            (${orgId}, 'vessel', ${vesselIds[0]!}, 'insurance', ${today}::date - 10, 'valid'),
            (${orgId}, 'vessel', ${vesselIds[1]!}, 'laswa_licence', ${inMonth}, 'valid'),
            (${orgId}, 'vessel', ${vesselIds[1]!}, 'radio_licence', ${today}::date + 200, 'valid')`;
  await sql`insert into public.incidents (org_id, source, description, urgent) values (${orgId}, 'app', 'Engine smoke', true)`;
});

afterAll(async () => {
  setIntegrationsForTesting(undefined);
  for (const id of created.orgs) await sql`delete from public.orgs where id = ${id}`;
  for (const id of created.users) await sql`delete from auth.users where id = ${id}`;
  await sql.end();
});

const org = () => ({ id: orgId, time_zone: ZONE, currency: "NGN" });
const db = () => supabaseAdmin() as unknown as Db;

describe("owner dashboard", () => {
  it("figures match the database totals", async () => {
    const s = await dashboardSummary(db(), org());
    const [sums] = await sql`
      select count(*) filter (where status <> 'cancelled')::int as trips,
             count(*) filter (where status = 'cancelled')::int as cancelled,
             coalesce(sum(passenger_count) filter (where status <> 'cancelled'), 0)::int as pax,
             coalesce(sum(takings_cash_minor) filter (where status <> 'cancelled'), 0)::bigint as cash,
             coalesce(sum(takings_digital_minor) filter (where status <> 'cancelled'), 0)::bigint as digital
      from public.trips where org_id = ${orgId}
        and (scheduled_departure at time zone ${ZONE})::date = (now() at time zone ${ZONE})::date`;
    expect(s.trips.total).toBe(sums!.trips + sums!.cancelled);
    expect(s.trips.cancelled).toBe(sums!.cancelled);
    expect(s.trips.arrived).toBe(2);
    expect(s.passengers).toBe(sums!.pax);
    expect(s.takings.cash.amountMinor).toBe(BigInt(sums!.cash));
    expect(s.takings.digital.amountMinor).toBe(BigInt(sums!.digital));
    expect(s.takings.total.amountMinor).toBe(BigInt(sums!.cash) + BigInt(sums!.digital));
    expect(s.alerts).toMatchObject({ expiredDocuments: 1, openIncidents: 1, pendingOverrides: 0 });
    expect(s.alerts.expiringDocuments).toBeGreaterThanOrEqual(0);
    expect(s.idleVessels.map((v) => v.name)).toEqual(["MV Quiet"]);
  });

  it("the weekly report's takings, expenses and net match the database", async () => {
    const r = await weeklyReport(db(), org(), weekStart(localDate(new Date(), ZONE)));
    const [e] = await sql`select sum(amount_minor)::bigint as total from public.expenses where org_id = ${orgId}`;
    expect(r.totals.expenses.amountMinor).toBe(BigInt(e!.total));
    expect(r.totals.cash.amountMinor).toBe(2850000n);
    expect(r.totals.net.amountMinor).toBe(2850000n + 300000n - BigInt(e!.total));
    expect(r.expenses.map((x) => x.category)).toEqual(["fuel", "levy"]);
  });
});

describe("assistant", () => {
  it("has read and draft tools only: nothing that moves money, deletes or overrides safety", () => {
    for (const t of TOOLS) {
      expect(["read", "draft"]).toContain(t.kind);
      expect(t.name).not.toMatch(FORBIDDEN_CAPABILITIES);
    }
  });

  it("answers 'Which certificates expire this month?' from the tool's results", async () => {
    const seen: ChatRequest[] = [];
    llm.scriptChat("assistant", (req) => {
      seen.push(req);
      return devAssistant(req);
    });
    const ctx = await assistantContext(supabaseAdmin(), orgId, "en", "app");
    const { text, tools } = await askAssistant(ctx, "Which certificates expire this month?");
    expect(tools).toEqual(["list_expiring_documents"]);
    // The second model call saw the tool result, and the answer is built from it.
    const toolMessage = seen[1]!.messages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toContain("laswa_licence");
    expect(text).toContain("laswa licence for MV Quiet");
    expect(text).toContain("insurance for MV Busy");
    expect(text).not.toContain("radio licence");
    expect(seen[0]!.system).toContain("never send money, delete records or approve safety overrides");
    const [job] =
      await sql`select kind, status from public.ai_jobs where org_id = ${orgId} and kind = 'assistant' order by created_at desc limit 1`;
    expect(job).toMatchObject({ kind: "assistant", status: "done" });
  });

  it("refuses to move money or override safety, and calls no tool", async () => {
    llm.scriptChat("assistant", devAssistant);
    const ctx = await assistantContext(supabaseAdmin(), orgId, "en", "whatsapp");
    for (const q of ["Send 50,000 naira to Bayo", "Override the safety lock for MV Busy"]) {
      const { text, tools } = await askAssistant(ctx, q);
      expect(tools).toEqual([]);
      expect(text).toMatch(/can't move money|approve safety overrides/);
    }
  });
});
