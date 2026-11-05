import { afterAll, describe, expect, it } from "vitest";
import { addMember, as, createOrg, createUser, inTx, rejects, sql, tokenPair } from "./helpers";

afterAll(async () => {
  await sql.end();
});

describe("orgs and memberships", () => {
  it("create_org makes the caller the owner and writes audit rows", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id, "Lagoon Ferries");
      const [m] = await tx`select role from public.memberships where org_id = ${orgId} and user_id = ${owner.id}`;
      expect(m?.role).toBe("owner");
      const actions = await tx`select action, actor_user_id from public.audit_logs where org_id = ${orgId} order by at`;
      // Same transaction, same timestamp: compare as a set.
      expect(actions.map((a) => a.action).sort()).toEqual(["membership.created", "org.created"]);
      expect(actions.every((a) => a.actor_user_id === owner.id)).toBe(true);
    }));

  it("a user in org A cannot read, insert into or update org B", () =>
    inTx(async (tx) => {
      const a = await createUser(tx, "A");
      const b = await createUser(tx, "B");
      const orgA = await createOrg(tx, a.id, "Org A");
      const orgB = await createOrg(tx, b.id, "Org B");
      const { hash } = tokenPair();

      await as(tx, a.id, async () => {
        expect(await tx`select id from public.orgs where id = ${orgB}`).toHaveLength(0);
        expect(await tx`select id from public.memberships where org_id = ${orgB}`).toHaveLength(0);
        expect(await tx`select id from public.audit_logs where org_id = ${orgB}`).toHaveLength(0);
        const updated = await tx`update public.orgs set name = 'Hijacked' where id = ${orgB} returning id`;
        expect(updated).toHaveLength(0);
        const roles = await tx`update public.memberships set role = 'crew' where org_id = ${orgB} returning id`;
        expect(roles).toHaveLength(0);
        const err = await rejects(
          tx,
          (sp) => sp`
          insert into public.invitations (org_id, phone_e164, role, token_hash, expires_at, invited_by)
          values (${orgB}, '+2348031112222', 'captain', ${hash}, now() + interval '1 day', ${a.id})`,
        );
        expect(err).toMatch(/row-level security/);
        // Their own org is fine.
        expect(await tx`select id from public.orgs where id = ${orgA}`).toHaveLength(1);
      });
      const [orgBRow] = await tx`select name from public.orgs where id = ${orgB}`;
      expect(orgBRow?.name).toBe("Org B");
    }));

  it("a captain cannot change roles; the owner can", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const captain = await createUser(tx, "Captain");
      const crew = await createUser(tx, "Crew");
      const orgId = await createOrg(tx, owner.id);
      const captainM = await addMember(tx, orgId, captain.id, "captain");
      const crewM = await addMember(tx, orgId, crew.id, "crew");

      await as(tx, captain.id, async () => {
        expect(await tx`update public.memberships set role = 'owner' where id = ${captainM} returning id`).toHaveLength(
          0,
        );
        expect(await tx`update public.memberships set role = 'manager' where id = ${crewM} returning id`).toHaveLength(
          0,
        );
        // Captains only see their own membership.
        expect(await tx`select id from public.memberships where org_id = ${orgId}`).toHaveLength(1);
      });
      await as(tx, owner.id, async () => {
        expect(await tx`update public.memberships set role = 'manager' where id = ${crewM} returning id`).toHaveLength(
          1,
        );
      });
      const [audit] =
        await tx`select action, actor_user_id from public.audit_logs where entity_id = ${crewM} and action = 'membership.role_changed'`;
      expect(audit?.actor_user_id).toBe(owner.id);
    }));

  it("the last owner cannot be demoted or removed", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const [m] = await tx`select id from public.memberships where org_id = ${orgId}`;
      await as(tx, owner.id, async () => {
        expect(
          await rejects(tx, (sp) => sp`update public.memberships set role = 'manager' where id = ${m!.id}`),
        ).toMatch(/last_owner/);
        expect(await rejects(tx, (sp) => sp`delete from public.memberships where id = ${m!.id}`)).toMatch(/last_owner/);
      });
    }));

  it("only platform admins change verification status", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const admin = await createUser(tx, "Admin");
      const orgId = await createOrg(tx, owner.id);
      await tx`insert into public.platform_admins (user_id) values (${admin.id})`;
      await as(tx, owner.id, async () => {
        expect(
          await rejects(tx, (sp) => sp`update public.orgs set verification_status = 'verified' where id = ${orgId}`),
        ).toMatch(/admin_only_field/);
      });
      await as(tx, admin.id, async () => {
        expect(
          await tx`update public.orgs set verification_status = 'verified' where id = ${orgId} returning id`,
        ).toHaveLength(1);
      });
    }));
});

describe("invitations", () => {
  it("managers invite captains and crew only; captains cannot invite", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const manager = await createUser(tx, "Manager");
      const captain = await createUser(tx, "Captain");
      const orgId = await createOrg(tx, owner.id);
      await addMember(tx, orgId, manager.id, "manager");
      await addMember(tx, orgId, captain.id, "captain");
      const invite = (role: string) => {
        const { hash } = tokenPair();
        return (sp: typeof tx) => sp`
          select public.create_invitation(${orgId}, '+2348039990001', ${role}::public.membership_role, ${hash}, now() + interval '7 days')`;
      };

      await as(tx, manager.id, async () => {
        await invite("captain")(tx);
        expect(await rejects(tx, invite("manager"))).toMatch(/row-level security/);
      });
      await as(tx, captain.id, async () => {
        expect(await rejects(tx, invite("crew"))).toMatch(/row-level security/);
      });
    }));

  it("accepting checks phone, expiry and single use, and is audited", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const invitee = await createUser(tx, "Invitee");
      const stranger = await createUser(tx, "Stranger");
      const orgId = await createOrg(tx, owner.id, "Harbour Co");
      const { token, hash } = tokenPair();

      await as(
        tx,
        owner.id,
        () =>
          tx`select public.create_invitation(${orgId}, ${invitee.phone}, 'captain', ${hash}, now() + interval '7 days')`,
      );

      const [preview] = await as(tx, null, () => tx`select * from public.invitation_preview(${token})`);
      expect(preview).toMatchObject({ org_name: "Harbour Co", role: "captain", status: "valid" });

      await as(tx, stranger.id, async () => {
        expect(await rejects(tx, (sp) => sp`select public.accept_invitation(${token})`)).toMatch(/phone_mismatch/);
      });
      await as(tx, invitee.id, async () => {
        const [row] = await tx`select public.accept_invitation(${token}) as org_id`;
        expect(row?.org_id).toBe(orgId);
        expect(await rejects(tx, (sp) => sp`select public.accept_invitation(${token})`)).toMatch(/invitation_used/);
      });

      const audit =
        await tx`select action, actor_user_id from public.audit_logs where org_id = ${orgId} and entity = 'invitation' order by at`;
      expect(audit.map((a) => a.action)).toEqual(["invitation.created", "invitation.accepted"]);
      expect(audit[1]?.actor_user_id).toBe(invitee.id);
      const [m] = await tx`select role from public.memberships where org_id = ${orgId} and user_id = ${invitee.id}`;
      expect(m?.role).toBe("captain");
    }));

  it("expired invitations cannot be accepted", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const invitee = await createUser(tx, "Invitee");
      const orgId = await createOrg(tx, owner.id);
      const { token, hash } = tokenPair();
      await tx`
        insert into public.invitations (org_id, phone_e164, role, token_hash, expires_at, invited_by)
        values (${orgId}, ${invitee.phone}, 'crew', ${hash}, now() - interval '1 minute', ${owner.id})`;
      await as(tx, invitee.id, async () => {
        expect(await rejects(tx, (sp) => sp`select public.accept_invitation(${token})`)).toMatch(/invitation_expired/);
      });
    }));
});

describe("profiles, anonymous access and the audit trail", () => {
  it("owners see member profiles; captains do not see each other", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const c1 = await createUser(tx, "Captain One");
      const c2 = await createUser(tx, "Captain Two");
      const orgId = await createOrg(tx, owner.id);
      await addMember(tx, orgId, c1.id, "captain");
      await addMember(tx, orgId, c2.id, "captain");
      await as(tx, owner.id, async () => {
        expect(await tx`select id from public.profiles where id in (${c1.id}, ${c2.id})`).toHaveLength(2);
      });
      await as(tx, c1.id, async () => {
        expect(await tx`select id from public.profiles where id = ${c2.id}`).toHaveLength(0);
        // Own phone number comes from auth and cannot be edited.
        expect(
          await rejects(tx, (sp) => sp`update public.profiles set phone_e164 = '+2348000000000' where id = ${c1.id}`),
        ).toMatch(/permission denied/);
        expect(
          await tx`update public.profiles set full_name = 'Capt. One' where id = ${c1.id} returning id`,
        ).toHaveLength(1);
      });
    }));

  it("signed-out visitors cannot read any identity table", () =>
    inTx(async (tx) => {
      await as(tx, null, async () => {
        for (const table of ["profiles", "orgs", "memberships", "invitations", "audit_logs", "platform_admins"]) {
          expect(await rejects(tx, (sp) => sp.unsafe(`select 1 from public.${table} limit 1`))).toMatch(
            /permission denied/,
          );
        }
      });
    }));

  it("audit rows cannot be updated or deleted, even by the database owner", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      expect(
        await rejects(tx, (sp) => sp`update public.audit_logs set action = 'tampered' where org_id = ${orgId}`),
      ).toMatch(/append_only/);
      expect(await rejects(tx, (sp) => sp`delete from public.audit_logs where org_id = ${orgId}`)).toMatch(
        /append_only/,
      );
    }));
});
