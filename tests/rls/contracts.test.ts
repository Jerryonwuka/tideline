import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeIntegrations, setIntegrationsForTesting, type Integrations } from "@/server/integrations";
import type { FakeMessagingClient } from "@/server/integrations/messaging/fake";
import { BUSINESS_BUCKET, generateContract } from "@/server/services/contracts";
import { runInvoicesOverdue } from "@/server/services/invoices";
import { supabaseAdmin } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { as, createOrg, createUser, inTx, rejects, sql, type Tx } from "./helpers";

config({ path: [".env.local", ".env"], quiet: true });
const committed = { orgs: [] as string[] };
let fakes: Integrations;

beforeAll(() => {
  fakes = createFakeIntegrations();
  setIntegrationsForTesting(fakes);
});
afterAll(async () => {
  setIntegrationsForTesting(undefined);
  for (const id of committed.orgs) await sql`delete from public.orgs where id = ${id}`;
  await sql.end();
});

async function setup(tx: Tx) {
  const owner = await createUser(tx, "Owner");
  const ownerOrg = await createOrg(tx, owner.id, "Owner Marine");
  const charterer = await createUser(tx, "Charterer");
  const chartererOrg = await createOrg(tx, charterer.id, "Oil Co");
  const outsider = await createUser(tx, "Outsider");
  await createOrg(tx, outsider.id, "Nosy");
  const [v] = await tx`insert into public.vessels (org_id, name, type, operating_country_code, charter_enabled)
                       values (${ownerOrg}, 'MV Contract', 'osv', 'NG', true) returning id`;
  const [c] =
    await tx`insert into public.charters (owner_org_id, charterer_org_id, vessel_id, start_date, end_date, currency, day_rate_minor, total_value_minor, commission_bps, status)
                       values (${ownerOrg}, ${chartererOrg}, ${v!.id}, '2026-12-01', '2026-12-05', 'NGN', 140000000, 700000000, 500, 'pending_contract') returning id`;
  return { owner, ownerOrg, charterer, chartererOrg, outsider, vesselId: v!.id as string, charterId: c!.id as string };
}

describe("contracts", () => {
  it("both parties accept with name, time and IP; the text then locks and the charter moves to payment", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      await as(tx, s.charterer.id, async () => {
        expect(
          await rejects(
            tx,
            (sp) => sp`insert into public.contracts (owner_org_id, charterer_org_id, charter_id, body_html, body_hash)
                        values (${s.ownerOrg}, ${s.chartererOrg}, ${s.charterId}, 'x', 'h')`,
          ),
        ).toMatch(/row-level security/);
      });
      const [k] = await as(
        tx,
        s.owner.id,
        () =>
          tx`insert into public.contracts (owner_org_id, charterer_org_id, charter_id, body_html, body_hash)
           values (${s.ownerOrg}, ${s.chartererOrg}, ${s.charterId}, 'Agreement text', 'hash1') returning id`,
      );
      await as(tx, s.outsider.id, async () => {
        expect(await tx`select 1 from public.contracts where id = ${k!.id}`).toHaveLength(0);
        expect(await rejects(tx, (sp) => sp`select public.accept_contract(${k!.id}, 'Nosy', '1.2.3.4', 'ua')`)).toMatch(
          /forbidden/,
        );
      });
      await as(tx, s.owner.id, async () => {
        // Acceptance only through accept_contract.
        expect(
          await rejects(tx, (sp) => sp`update public.contracts set owner_accepted_at = now() where id = ${k!.id}`),
        ).toMatch(/forbidden/);
        const [r] = await tx`select public.accept_contract(${k!.id}, 'Ola Owner', '10.0.0.1', 'Mozilla/5.0') as side`;
        expect(r?.side).toBe("owner");
        expect(
          await rejects(tx, (sp) => sp`select public.accept_contract(${k!.id}, 'Ola Owner', '10.0.0.1', 'x')`),
        ).toMatch(/already_decided/);
        // The text can't change once anyone has accepted.
        expect(
          await rejects(tx, (sp) => sp`update public.contracts set body_html = 'changed' where id = ${k!.id}`),
        ).toMatch(/contract_locked/);
      });
      await as(tx, s.charterer.id, async () => {
        const [r] =
          await tx`select public.accept_contract(${k!.id}, 'Ada Charterer', '10.0.0.2', 'Mozilla/5.0') as side`;
        expect(r?.side).toBe("charterer");
      });
      const [done] =
        await tx`select owner_accepted_at, charterer_accepted_at, acceptance_meta from public.contracts where id = ${k!.id}`;
      expect(done?.owner_accepted_at).not.toBeNull();
      expect(done?.charterer_accepted_at).not.toBeNull();
      expect(done?.acceptance_meta).toMatchObject({
        owner: { name: "Ola Owner", ip: "10.0.0.1", body_hash: "hash1" },
        charterer: { name: "Ada Charterer", ip: "10.0.0.2", body_hash: "hash1" },
      });
      const [c] = await tx`select status from public.charters where id = ${s.charterId}`;
      expect(c?.status).toBe("pending_payment");
    }));
});

describe("invoices", () => {
  it("numbers per org and per year, atomically; only members can draw numbers", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const year = new Date().getUTCFullYear();
      await as(tx, s.owner.id, async () => {
        const [a] = await tx`select public.next_invoice_number(${s.ownerOrg}) as n`;
        const [b] = await tx`select public.next_invoice_number(${s.ownerOrg}) as n`;
        expect([a?.n, b?.n]).toEqual([`INV-${year}-0001`, `INV-${year}-0002`]);
      });
      await as(tx, s.charterer.id, async () => {
        const [c] = await tx`select public.next_invoice_number(${s.chartererOrg}) as n`;
        expect(c?.n).toBe(`INV-${year}-0001`);
        expect(await rejects(tx, (sp) => sp`select public.next_invoice_number(${s.ownerOrg})`)).toMatch(/forbidden/);
      });
    }));

  it("off-platform charters carry no commission; paid amounts are set only by the server", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      await as(tx, s.owner.id, async () => {
        const [c] =
          await tx`insert into public.charters (owner_org_id, vessel_id, client_name, start_date, end_date, currency, day_rate_minor, total_value_minor, commission_bps, booked_on_platform)
                             values (${s.ownerOrg}, ${s.vesselId}, 'Local client', '2026-12-01', '2026-12-02', 'NGN', 100, 200, 900, false)
                             returning commission_bps, status, charterer_org_id`;
        expect(c).toMatchObject({ commission_bps: 0, status: "active", charterer_org_id: null });
        expect(
          await rejects(
            tx,
            (
              sp,
            ) => sp`insert into public.charters (owner_org_id, vessel_id, start_date, end_date, currency, day_rate_minor, total_value_minor, booked_on_platform)
                        values (${s.ownerOrg}, ${s.vesselId}, '2026-12-01', '2026-12-02', 'NGN', 100, 200, true)`,
          ),
        ).toMatch(/row-level security/);
        const [inv] =
          await tx`insert into public.invoices (org_id, number, bill_to, line_items, currency, subtotal_minor, total_minor, public_token, status)
                               values (${s.ownerOrg}, 'INV-T-1', '{"name":"Client"}', '[]', 'NGN', 100, 100, ${randomUUID()}, 'sent') returning id`;
        expect(
          await rejects(tx, (sp) => sp`update public.invoices set amount_paid_minor = 100 where id = ${inv!.id}`),
        ).toMatch(/permission denied/);
      });
    }));

  it("the overdue job flags late invoices and reminds once per interval", async () => {
    const [org] =
      await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes, settings)
                            values ('Invoice Marine', 'vessel_owner', 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{charter}', '{"invoice_reminder_days": 7}') returning id`;
    committed.orgs.push(org!.id as string);
    const phone = `+234809${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const [inv] =
      await sql`insert into public.invoices (org_id, number, bill_to, line_items, currency, subtotal_minor, total_minor, public_token, status, due_date)
                            values (${org!.id}, 'INV-2026-0001', ${sql.json({ name: "Client", phone })}, '[]', 'NGN', 500000, 500000, ${randomUUID()}, 'sent', '2026-11-01')
                            returning id`;
    const reminders = () => (fakes.messaging as FakeMessagingClient).sent.filter((m) => m.toE164 === phone).length;
    const day = (d: string) => new Date(`${d}T09:00:00Z`);

    const first = await runInvoicesOverdue(day("2026-11-04"));
    expect(first.flagged).toBeGreaterThanOrEqual(1);
    const [row] = await sql`select status, last_reminded_at from public.invoices where id = ${inv!.id}`;
    expect(row?.status).toBe("overdue");
    expect(reminders()).toBe(1);

    await runInvoicesOverdue(day("2026-11-05")); // within the interval: no second reminder
    await runInvoicesOverdue(day("2026-11-10"));
    expect(reminders()).toBe(1);
    await runInvoicesOverdue(day("2026-11-12")); // 8 days later: reminded again
    expect(reminders()).toBe(2);
  });
});

describe("contract PDF", () => {
  it("is generated from the template and stored privately", async () => {
    const [owner] =
      await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
                              values ('PDF Marine', 'vessel_owner', 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{charter}') returning id`;
    const [chart] =
      await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
                              values ('PDF Charterer', 'charterer', 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{charter}') returning id`;
    committed.orgs.push(owner!.id as string, chart!.id as string);
    const [v] = await sql`insert into public.vessels (org_id, name, type, operating_country_code, charter_enabled)
                          values (${owner!.id}, 'MV Paper', 'osv', 'NG', true) returning id`;
    const [c] =
      await sql`insert into public.charters (owner_org_id, charterer_org_id, vessel_id, start_date, end_date, currency, governing_country_code, day_rate_minor, mobilisation_minor, total_value_minor, commission_bps, status)
                          values (${owner!.id}, ${chart!.id}, ${v!.id}, '2026-12-01', '2026-12-05', 'NGN', 'NG', 140000000, 50000000, 750000000, 500, 'pending_contract') returning id`;
    // As the service role (stands in for the owner's session here).
    const id = await generateContract(supabaseAdmin() as unknown as Db, c!.id as string);
    const [k] = await sql`select body_html, pdf_path from public.contracts where id = ${id}`;
    expect(k?.body_html).toContain("PDF Marine");
    expect(k?.body_html).toContain("PDF Charterer");
    expect(k?.body_html).toContain("MV Paper");
    expect(k?.body_html).toContain("NGN 1,400,000.00 per day");
    expect(k?.pdf_path).toBe(`${owner!.id}/contracts/${id}.pdf`);
    const file = await supabaseAdmin().storage.from(BUSINESS_BUCKET).download(k!.pdf_path);
    const head = new TextDecoder().decode((await file.data!.arrayBuffer()).slice(0, 5));
    expect(head).toBe("%PDF-");
    // The bucket is private: no public URL works.
    const pub = supabaseAdmin().storage.from(BUSINESS_BUCKET).getPublicUrl(k!.pdf_path).data.publicUrl;
    expect((await fetch(pub)).ok).toBe(false);
    await supabaseAdmin().storage.from(BUSINESS_BUCKET).remove([k!.pdf_path]);
  });
});
