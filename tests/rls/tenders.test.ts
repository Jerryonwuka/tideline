import { describe, expect, it } from "vitest";
import { addMember, as, createOrg, createUser, inTx, rejects, type Tx } from "./helpers";

async function setup(tx: Tx) {
  const owner = await createUser(tx, "Owner");
  const org = await createOrg(tx, owner.id, "Bid Marine");
  const captain = await createUser(tx, "Captain");
  await addMember(tx, org, captain.id, "captain");
  const outsider = await createUser(tx, "Outsider");
  await createOrg(tx, outsider.id, "Nosy");
  const { tender, pack } = await as(tx, owner.id, async () => {
    const [t] = await tx`insert into public.tenders (org_id, title, requirements_text)
                          values (${org}, 'Crew boat hire', 'Bidders must provide insurance.') returning id`;
    const [p] = await tx`insert into public.tender_packs (org_id, tender_id) values (${org}, ${t!.id}) returning id`;
    return { tender: t!.id as string, pack: p!.id as string };
  });
  return { owner, org, captain, outsider, tender, pack };
}

describe("tenders", () => {
  it("only the org's owners and managers see tenders and packs", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      for (const user of [s.outsider.id, s.captain.id]) {
        await as(tx, user, async () => {
          expect(await tx`select id from public.tenders where id = ${s.tender}`).toHaveLength(0);
          expect(await tx`select id from public.tender_packs where id = ${s.pack}`).toHaveLength(0);
        });
      }
      await as(tx, s.outsider.id, async () => {
        expect(
          await rejects(
            tx,
            (sp) => sp`insert into public.tenders (org_id, title, requirements_text) values (${s.org}, 'x', 'y')`,
          ),
        ).toMatch(/row-level security/);
      });
    }));

  it("export results are server-only; reviewer and submit-anyway are the signed-in user, audited", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      await as(tx, s.owner.id, async () => {
        expect(
          await rejects(tx, (sp) => sp`update public.tender_packs set export_path = 'x.pdf' where id = ${s.pack}`),
        ).toMatch(/permission denied/);
        expect(
          await rejects(tx, (sp) => sp`update public.tender_packs set status = 'exported' where id = ${s.pack}`),
        ).toMatch(/exported by the server/);
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`update public.tender_packs set reviewed_by = ${s.captain.id}, status = 'reviewed' where id = ${s.pack}`,
          ),
        ).toMatch(/signed-in user/);
        await tx`update public.tender_packs set submit_anyway = true, submit_anyway_by = ${s.owner.id},
                   submit_anyway_at = '2000-01-01' where id = ${s.pack}`;
        const [p] = await tx`select submit_anyway_at from public.tender_packs where id = ${s.pack}`;
        expect(new Date(p!.submit_anyway_at as string).getFullYear()).toBeGreaterThan(2000);
      });
      const audits = await tx`select actor_user_id, after from public.audit_logs
                              where entity = 'tender_pack' and entity_id = ${s.pack} and action = 'tender_pack.updated'`;
      expect(
        audits.some((a) => a.actor_user_id === s.owner.id && (a.after as { submit_anyway: boolean }).submit_anyway),
      ).toBe(true);
    }));
});
