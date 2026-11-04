import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeIntegrations, setIntegrationsForTesting, type Integrations } from "@/server/integrations";
import type { FakeLlmClient } from "@/server/integrations/llm/fake";
import { devIdleListing } from "@/server/integrations/llm/dev-idle";
import { runIdleVessels } from "@/server/services/idle";
import { addMember, as, createOrg, createUser, inTx, rejects, sql } from "./helpers";

config({ path: [".env.local", ".env"], quiet: true });
const committed = { orgs: [] as string[] };
let fakes: Integrations;

beforeAll(() => {
  fakes = createFakeIntegrations();
  (fakes.llm as FakeLlmClient).respond("idle_listing", ({ lastUserMessage }: { lastUserMessage: string }) =>
    devIdleListing(lastUserMessage),
  );
  setIntegrationsForTesting(fakes);
});
afterAll(async () => {
  setIntegrationsForTesting(undefined);
  for (const id of committed.orgs) {
    await sql`delete from public.charters where owner_org_id = ${id} or charterer_org_id = ${id}`;
    await sql`delete from public.orgs where id = ${id}`;
  }
  await sql.end();
});

async function org(name: string, type: "vessel_owner" | "charterer") {
  const [row] =
    await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
              values (${name}, ${type}, 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{charter}') returning id`;
  committed.orgs.push(row!.id as string);
  return row!.id as string;
}
const ngn = (major: number) => String(BigInt(major) * 100n);

describe("idle-vessels job", () => {
  it("suggests a rate (inputs saved, never below the minimum) and ranks past clients first", async () => {
    const owner = await org("Onne Idle Marine", "vessel_owner");
    const pastClient = await org("Past Client Energy", "charterer");
    const keen = await org("Keen Searcher Oil", "charterer");
    const [v1] =
      await sql`insert into public.vessels (org_id, name, type, operating_country_code, charter_enabled, length_m)
                           values (${owner}, 'MV Long Idle', 'crew_boat', 'NG', true, 32) returning id`;
    const [v2] =
      await sql`insert into public.vessels (org_id, name, type, operating_country_code, charter_enabled, length_m)
                           values (${owner}, 'MV Just Back', 'crew_boat', 'NG', true, 30) returning id`;
    const charter = (vessel: string, from: string, to: string, status: string) =>
      sql`insert into public.charters (owner_org_id, charterer_org_id, vessel_id, start_date, end_date, currency, day_rate_minor, total_value_minor, status)
          values (${owner}, ${pastClient}, ${vessel}, ${from}, ${to}, 'NGN', ${ngn(1_000_000)}, ${ngn(20_000_000)}, ${status}::public.charter_status)`;
    await charter(v1!.id, "2026-10-01", "2026-10-20", "completed");
    await charter(v2!.id, "2026-10-25", "2026-11-03", "completed");
    await sql`insert into public.charter_listings (org_id, vessel_id, currency, day_rate_minor, min_rate_minor, operating_area, status)
              values (${owner}, ${v1!.id}, 'NGN', ${ngn(1_100_000)}, ${ngn(950_000)}, 'Bonny and Onne', 'draft')`;
    for (let i = 0; i < 3; i++) {
      await sql`insert into public.charter_requests (charterer_org_id, vessel_type, start_date, end_date, location, purpose)
                values (${keen}, 'crew_boat', '2026-12-01', '2026-12-10', 'Onne terminal', 'Crew change')`;
    }
    for (let i = 0; i < 5; i++) {
      await sql`insert into public.board_searches (charterer_org_id, vessel_type, area) values (${keen}, 'crew_boat', 'Onne')`;
    }

    const now = new Date("2026-11-04T07:00:00Z");
    await runIdleVessels(now);

    const [vessel] = await sql`select status, idle_since from public.vessels where id = ${v1!.id}`;
    expect(vessel!.status).toBe("idle");
    const [s] = await sql`select * from public.vessel_suggestions where vessel_id = ${v1!.id}`;
    expect(s).toBeDefined();
    // 14 days idle: ₦1,000,000 baseline − 10% = ₦900,000, raised to the ₦950,000 minimum.
    expect(BigInt(s!.suggested_rate_minor)).toBe(BigInt(ngn(950_000)));
    expect(s!.inputs).toMatchObject({ baseline_source: "vessel", weeks_idle: 2, floored: true, idle_days: 14 });
    expect(s!.review_status).toBe("needs_review");
    expect(s!.rationale).toContain("minimum");
    const buyers = s!.buyers as { org_id: string; reasons: string[] }[];
    expect(buyers.map((b) => b.org_id)).toEqual([pastClient, keen]);
    expect(buyers[1]!.reasons).toEqual(["similar_requests", "similar_searches", "area"]);

    // Back from a charter yesterday: idle, but not long enough for a suggestion.
    expect(await sql`select id from public.vessel_suggestions where vessel_id = ${v2!.id}`).toHaveLength(0);

    // Once it's working again the vessel is active and the suggestion goes.
    await charter(v1!.id, "2026-11-04", "2026-11-20", "active");
    await runIdleVessels(new Date("2026-11-05T07:00:00Z"));
    const [after] = await sql`select status, idle_since from public.vessels where id = ${v1!.id}`;
    expect(after!.status).toBe("active");
    expect(after!.idle_since).toBeNull();
    expect(await sql`select id from public.vessel_suggestions where vessel_id = ${v1!.id}`).toHaveLength(0);
  });

  it("owners and managers read their suggestions; nobody writes them from the app; searches stay private", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id, "Idle Co");
      const captain = await createUser(tx, "Captain");
      await addMember(tx, orgId, captain.id, "captain");
      const outsider = await createUser(tx, "Outsider");
      await createOrg(tx, outsider.id, "Nosy");
      const [v] = await tx`insert into public.vessels (org_id, name, type, operating_country_code, charter_enabled)
                           values (${orgId}, 'MV Quiet', 'tug', 'NG', true) returning id`;
      const [s] =
        await tx`insert into public.vessel_suggestions (org_id, vessel_id, idle_since, currency, suggested_rate_minor, inputs)
                           values (${orgId}, ${v!.id}, now(), 'NGN', 100000, '{}') returning id`;
      await as(tx, owner.id, async () => {
        expect(await tx`select id from public.vessel_suggestions where id = ${s!.id}`).toHaveLength(1);
        expect(
          await rejects(
            tx,
            (sp) => sp`update public.vessel_suggestions set suggested_rate_minor = 1 where id = ${s!.id}`,
          ),
        ).toMatch(/permission denied/);
        expect(await rejects(tx, (sp) => sp`select id from public.board_searches`)).toMatch(/permission denied/);
      });
      for (const user of [captain.id, outsider.id]) {
        await as(tx, user, async () => {
          expect(await tx`select id from public.vessel_suggestions where id = ${s!.id}`).toHaveLength(0);
        });
      }
    }));
});
