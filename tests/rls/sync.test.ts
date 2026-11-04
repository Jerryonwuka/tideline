import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { addMember, as, createOrg, createUser, inTx, rejects, sql } from "./helpers";

afterAll(async () => {
  await sql.end();
});

describe("offline sync op log", () => {
  it("a person records and sees only their own ops, once per client_id, and never edits them", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const captain = await createUser(tx, "Captain");
      await addMember(tx, orgId, captain.id, "captain");
      const outsider = await createUser(tx, "Outsider");
      const op = randomUUID();

      await as(tx, captain.id, async () => {
        await tx`insert into public.sync_ops (org_id, client_id, user_id, op, status)
                 values (${orgId}, ${op}, ${captain.id}, 'trip.create', 'applied')`;
        // The same op again is refused by the key (the server then reports the first outcome).
        expect(
          await rejects(
            tx,
            (sp) => sp`insert into public.sync_ops (org_id, client_id, user_id, op, status)
                        values (${orgId}, ${op}, ${captain.id}, 'trip.create', 'applied')`,
          ),
        ).toMatch(/duplicate key/);
        // Not on someone else's behalf.
        expect(
          await rejects(
            tx,
            (sp) => sp`insert into public.sync_ops (org_id, client_id, user_id, op, status)
                        values (${orgId}, ${randomUUID()}, ${owner.id}, 'trip.create', 'applied')`,
          ),
        ).toMatch(/row-level security/);
        expect(
          await rejects(tx, (sp) => sp`update public.sync_ops set status = 'rejected' where client_id = ${op}`),
        ).toMatch(/permission denied/);
        expect(await rejects(tx, (sp) => sp`delete from public.sync_ops where client_id = ${op}`)).toMatch(
          /permission denied/,
        );
      });

      await as(tx, owner.id, async () => {
        expect(await tx`select 1 from public.sync_ops where org_id = ${orgId}`).toHaveLength(0);
      });
      await as(tx, outsider.id, async () => {
        expect(
          await rejects(
            tx,
            (sp) => sp`insert into public.sync_ops (org_id, client_id, user_id, op, status)
                        values (${orgId}, ${randomUUID()}, ${outsider.id}, 'trip.create', 'applied')`,
          ),
        ).toMatch(/row-level security/);
      });
    }));
});
