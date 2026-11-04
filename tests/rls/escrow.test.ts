import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { releaseSplit } from "@/lib/escrow";
import { money } from "@/lib/money";
import { createFakeIntegrations, setIntegrationsForTesting, type Integrations } from "@/server/integrations";
import { FakePaymentProvider } from "@/server/integrations/payments/fake";
import { processPayout, resolveDispute, settlePayout } from "@/server/services/escrow";
import { handlePaymentWebhook } from "@/server/services/payments";
import type { Me } from "@/server/services/profile";
import { supabaseAdmin } from "@/server/supabase/admin";
import { as, createOrg, createUser, inTx, rejects, sql, type Tx } from "./helpers";

config({ path: [".env.local", ".env"], quiet: true });

// §11 escrow (M13 acceptance): pay → hold → on-hire → release → payout minus commission with a
// balanced ledger; a dispute freezes releases until an admin resolves it; repeats pay nothing more.

const MOBILISATION = 50000000n; // ₦500,000
const TOTAL = 750000000n; // 5 days × ₦1,400,000 + mobilisation
const committed = { orgs: [] as string[] };
let fakes: Integrations;

beforeAll(() => {
  fakes = createFakeIntegrations();
  setIntegrationsForTesting(fakes);
});
afterAll(async () => {
  setIntegrationsForTesting(undefined);
  // The ledger is append-only for the app; the test (as the database owner) clears its own rows.
  for (const id of committed.orgs) {
    await sql`delete from public.ledger_entries where org_id = ${id} or payment_id in (select id from public.payments where org_id = ${id})`;
    await sql`delete from public.orgs where id = ${id}`;
  }
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
                       values (${ownerOrg}, 'MV Escrow', 'osv', 'NG', true) returning id`;
  const [c] =
    await tx`insert into public.charters (owner_org_id, charterer_org_id, vessel_id, start_date, end_date, currency, governing_country_code,
                                                    day_rate_minor, mobilisation_minor, total_value_minor, commission_bps, status)
                       values (${ownerOrg}, ${chartererOrg}, ${v!.id}, '2026-12-01', '2026-12-05', 'NGN', 'NG',
                               140000000, ${MOBILISATION}, ${TOTAL}, 500, 'pending_payment') returning id`;
  const [p] =
    await tx`insert into public.payments (org_id, payer_org_id, purpose, reference_type, reference_id, provider, provider_ref, currency, amount_minor, status)
                       values (${ownerOrg}, ${chartererOrg}, 'charter_escrow', 'charter', ${c!.id}, 'paystack', ${`ESC-${randomUUID()}`}, 'NGN', ${TOTAL}, 'success')
                       returning id`;
  return { owner, ownerOrg, charterer, chartererOrg, outsider, charterId: c!.id as string, paymentId: p!.id as string };
}

async function ledger(tx: Tx, paymentId: string) {
  const rows = await tx`select account, sum(debit_minor)::bigint as debit, sum(credit_minor)::bigint as credit
                        from public.ledger_entries where payment_id = ${paymentId} group by account`;
  return Object.fromEntries(rows.map((r) => [r.account, { debit: BigInt(r.debit), credit: BigInt(r.credit) }]));
}

describe("escrow in the database", () => {
  it("pay → hold → on-hire → release → payout minus commission; the ledger balances", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const [{ id: hold }] = (await tx`select public.fund_escrow(${s.paymentId}) as id`) as unknown as [{ id: string }];
      // A repeated confirmation funds nothing more.
      const [again] = await tx`select public.fund_escrow(${s.paymentId}) as id`;
      expect(again?.id).toBe(hold);
      expect((await ledger(tx, s.paymentId)).escrow).toEqual({ debit: 0n, credit: TOTAL });
      const [charter] = await tx`select status from public.charters where id = ${s.charterId}`;
      expect(charter?.status).toBe("active");

      // Two-sided on-hire; outsiders can't confirm; people can't release funds themselves.
      await as(tx, s.outsider.id, async () => {
        expect(await rejects(tx, (sp) => sp`select public.confirm_hire(${s.charterId}, 'on')`)).toMatch(/forbidden/);
      });
      await as(tx, s.charterer.id, async () => {
        const [r] = await tx`select public.confirm_hire(${s.charterId}, 'on') as state`;
        expect(r?.state).toBe("waiting");
        expect(
          await rejects(tx, (sp) => sp`select public.release_escrow(${hold}, 'mobilisation', 1, ${s.charterer.id})`),
        ).toMatch(/permission denied/);
      });
      await as(tx, s.owner.id, async () => {
        const [r] = await tx`select public.confirm_hire(${s.charterId}, 'on') as state`;
        expect(r?.state).toBe("both");
      });

      // The server releases the mobilisation tranche; a second attempt pays nothing more.
      await tx`select public.release_escrow(${hold}, 'mobilisation', ${MOBILISATION}, ${s.owner.id})`;
      expect(
        await rejects(
          tx,
          (sp) => sp`select public.release_escrow(${hold}, 'mobilisation', ${MOBILISATION}, ${s.owner.id})`,
        ),
      ).toMatch(/already_released/);
      // Off-hire releases the rest (capped at what's left).
      await tx`select public.release_escrow(${hold}, 'hire', ${TOTAL}, ${s.owner.id})`;
      const [h] = await tx`select status, released_minor from public.escrow_holds where id = ${hold}`;
      expect(h).toMatchObject({ status: "released", released_minor: String(TOTAL) });

      // Commission: 5% minus the 1% in-app discount = 4%, half to even, same as the app's maths.
      const expected = [MOBILISATION, TOTAL - MOBILISATION].map((g) => releaseSplit(money(g, "NGN"), 500, 100));
      const payouts =
        await tx`select amount_minor, commission_minor from public.payouts where escrow_hold_id = ${hold} order by amount_minor`;
      expect(payouts.map((p) => [BigInt(p.amount_minor), BigInt(p.commission_minor)]).sort()).toEqual(
        expected.map((e) => [e.payout.amountMinor, e.commission.amountMinor]).sort(),
      );

      // The ledger balances to the minor unit: escrow in = escrow out; commission + payable = released.
      const l = await ledger(tx, s.paymentId);
      expect(l.escrow!.credit - l.escrow!.debit).toBe(0n);
      const commission = expected.reduce((n, e) => n + e.commission.amountMinor, 0n);
      const payable = expected.reduce((n, e) => n + e.payout.amountMinor, 0n);
      expect(l.platform_revenue!.credit).toBe(commission);
      expect(l.payee_payable!.credit).toBe(payable);
      expect(commission + payable).toBe(TOTAL);
      const [c2] = await tx`select status from public.charters where id = ${s.charterId}`;
      expect(c2?.status).toBe("completed");
    }));

  it("a dispute freezes releases; only admin tranches pass; nobody edits holds or the ledger", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const [{ id: hold }] = (await tx`select public.fund_escrow(${s.paymentId}) as id`) as unknown as [{ id: string }];
      await as(tx, s.outsider.id, async () => {
        expect(await rejects(tx, (sp) => sp`select public.dispute_escrow(${hold}, 'not my charter')`)).toMatch(
          /forbidden/,
        );
      });
      await as(tx, s.charterer.id, async () => {
        await tx`select public.dispute_escrow(${hold}, 'Vessel arrived without crew')`;
      });
      expect(
        await rejects(
          tx,
          (sp) => sp`select public.release_escrow(${hold}, 'mobilisation', ${MOBILISATION}, ${s.owner.id})`,
        ),
      ).toMatch(/escrow_disputed/);
      // Admin resolution: split — part to the owner, the rest refunded.
      await tx`select public.release_escrow(${hold}, 'admin_release', ${300000000n}, ${s.owner.id})`;
      await tx`select public.refund_escrow(${hold}, 'admin_refund', ${TOTAL}, ${s.owner.id})`;
      const [h] = await tx`select status, released_minor, refunded_minor from public.escrow_holds where id = ${hold}`;
      expect(h).toMatchObject({
        status: "released",
        released_minor: "300000000",
        refunded_minor: String(TOTAL - 300000000n),
      });
      const l = await ledger(tx, s.paymentId);
      expect(l.escrow!.credit - l.escrow!.debit).toBe(0n);

      await as(tx, s.owner.id, async () => {
        expect(
          await rejects(tx, (sp) => sp`update public.escrow_holds set status = 'held' where id = ${hold}`),
        ).toMatch(/permission denied/);
        expect(
          await rejects(tx, (sp) => sp`delete from public.ledger_entries where payment_id = ${s.paymentId}`),
        ).toMatch(/permission denied/);
      });
      const audits =
        await tx`select action from public.audit_logs where entity in ('escrow_hold', 'escrow_release') and entity_id = ${hold}`;
      expect(audits.length).toBeGreaterThanOrEqual(3);
    }));
});

describe("escrow through the services", () => {
  it("a repeated payment webhook funds once; a repeated transfer webhook pays out once; only admins resolve", async () => {
    const [owner] =
      await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
                              values ('Svc Marine', 'vessel_owner', 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{charter}') returning id`;
    const [chart] =
      await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
                              values ('Svc Charterer', 'charterer', 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{charter}') returning id`;
    committed.orgs.push(owner!.id as string, chart!.id as string);
    const [v] = await sql`insert into public.vessels (org_id, name, type, operating_country_code, charter_enabled)
                          values (${owner!.id}, 'MV Service', 'osv', 'NG', true) returning id`;
    const [c] =
      await sql`insert into public.charters (owner_org_id, charterer_org_id, vessel_id, start_date, end_date, currency, governing_country_code,
                                                       day_rate_minor, mobilisation_minor, total_value_minor, commission_bps, status)
                          values (${owner!.id}, ${chart!.id}, ${v!.id}, '2026-12-01', '2026-12-05', 'NGN', 'NG', 140000000, ${MOBILISATION}, ${TOTAL}, 500, 'pending_payment')
                          returning id`;
    const ref = `ESC-${randomUUID()}`;
    await sql`insert into public.payments (org_id, payer_org_id, purpose, reference_type, reference_id, provider, provider_ref, currency, amount_minor)
              values (${owner!.id}, ${chart!.id}, 'charter_escrow', 'charter', ${c!.id}, 'paystack', ${ref}, 'NGN', ${TOTAL})`;
    await sql`insert into public.bank_accounts (org_id, country_code, currency, provider, bank_code, account_number_last4, account_name, provider_recipient_code, verified)
              values (${owner!.id}, 'NG', 'NGN', 'paystack', '058', '1234', 'Svc Marine Ltd', 'RCP_test', true)`;

    const charge = {
      id: `evt_${ref}`,
      event: "charge.success",
      reference: ref,
      amount_minor: String(TOTAL),
      currency: "NGN",
    };
    expect(await handlePaymentWebhook("paystack", FakePaymentProvider.signedWebhook(charge))).toMatchObject({
      outcome: "applied",
    });
    expect(await handlePaymentWebhook("paystack", FakePaymentProvider.signedWebhook(charge))).toEqual({
      status: "duplicate",
    });
    const holds = await sql`select id from public.escrow_holds where charter_id = ${c!.id}`;
    expect(holds).toHaveLength(1);

    const admin = supabaseAdmin();
    const { data: payoutId } = await admin.rpc("release_escrow", {
      p_hold: holds[0]!.id,
      p_tranche: "mobilisation",
      p_gross: Number(MOBILISATION),
      p_by: randomUUID(),
    });
    await processPayout(admin, payoutId!);
    const transfers = (fakes.paymentProviders.find((p) => p.id === "paystack") as FakePaymentProvider).transfers;
    expect(transfers.at(-1)?.recipientCode).toBe("RCP_test");
    const [p] = await sql`select provider_transfer_ref, amount_minor from public.payouts where id = ${payoutId}`;
    expect(await settlePayout(admin, p!.provider_transfer_ref, "success")).toBe("applied");
    expect(await settlePayout(admin, p!.provider_transfer_ref, "success")).toBe("duplicate");
    const debits =
      await sql`select count(*)::int as n from public.ledger_entries where payout_id = ${payoutId} and debit_minor > 0`;
    expect(debits[0]?.n).toBe(1);

    // Disputes are resolved by platform admins only.
    await sql`update public.escrow_holds set status = 'disputed', dispute_reason = 'test' where id = ${holds[0]!.id}`;
    const me = (isPlatformAdmin: boolean): Me => ({
      userId: randomUUID(),
      phone: null,
      fullName: "x",
      locale: "en",
      timeZone: null,
      isPlatformAdmin,
      memberships: [],
    });
    await expect(resolveDispute(me(false), holds[0]!.id, "release")).rejects.toMatchObject({ code: "forbidden" });
    const r = await resolveDispute(me(true), holds[0]!.id, "split", 100000000n);
    expect(r).toEqual({ toOwner: 100000000n, toCharterer: TOTAL - MOBILISATION - 100000000n });
    const [h] = await sql`select status from public.escrow_holds where id = ${holds[0]!.id}`;
    expect(h?.status).toBe("released");
  });
});
