import { afterAll, describe, expect, it } from "vitest";
import { addMember, as, createOrg, createUser, inTx, rejects, sql, type Tx } from "./helpers";

afterAll(async () => {
  await sql.end();
});

async function vessel(tx: Tx, orgId: string, name: string) {
  const [v] =
    await tx`insert into public.vessels (org_id, name, type, operating_country_code) values (${orgId}, ${name}, 'ferry', 'NG') returning id`;
  return v!.id as string;
}
async function crewMember(tx: Tx, orgId: string, name: string, userId: string | null = null) {
  const [c] =
    await tx`insert into public.crew_members (org_id, full_name, crew_role, user_id) values (${orgId}, ${name}, 'captain', ${userId}) returning id`;
  return c!.id as string;
}
async function document(
  tx: Tx,
  orgId: string,
  subjectType: string,
  subjectId: string,
  expiry: string | null,
  status = "valid",
) {
  const [d] = await tx`
    insert into public.documents (org_id, subject_type, subject_id, document_type_code, expiry_date, status, file_path)
    values (${orgId}, ${subjectType}::public.applies_to, ${subjectId}, 'insurance', ${expiry}, ${status}::public.document_status,
            ${`${orgId}/${subjectType}/${subjectId}/file.jpg`})
    returning id`;
  return d!.id as string;
}

describe("vessels, crew and documents", () => {
  it("org A cannot see or touch org B's fleet and documents", () =>
    inTx(async (tx) => {
      const a = await createUser(tx, "A");
      const b = await createUser(tx, "B");
      const orgA = await createOrg(tx, a.id, "Org A");
      const orgB = await createOrg(tx, b.id, "Org B");
      const vB = await vessel(tx, orgB, "B Boat");
      await document(tx, orgB, "vessel", vB, "2030-01-01");
      await as(tx, a.id, async () => {
        expect(await tx`select id from public.vessels where org_id = ${orgB}`).toHaveLength(0);
        expect(await tx`select id from public.documents where org_id = ${orgB}`).toHaveLength(0);
        expect(await tx`select id from public.documents_live where org_id = ${orgB}`).toHaveLength(0);
        expect(await tx`update public.vessels set name = 'Mine' where id = ${vB} returning id`).toHaveLength(0);
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`insert into public.vessels (org_id, name, type, operating_country_code) values (${orgB}, 'X', 'ferry', 'NG')`,
          ),
        ).toMatch(/row-level security/);
        // A document in my org can't point at their vessel either.
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`insert into public.documents (org_id, subject_type, subject_id, document_type_code) values (${orgA}, 'vessel', ${vB}, 'insurance')`,
          ),
        ).toMatch(/invalid_subject/);
      });
    }));

  it("captains see documents of their assigned vessel only; crew see their own certificates", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const captain = await createUser(tx, "Captain");
      const orgId = await createOrg(tx, owner.id);
      await addMember(tx, orgId, captain.id, "captain");
      const mine = await vessel(tx, orgId, "Assigned");
      const other = await vessel(tx, orgId, "Other");
      const me = await crewMember(tx, orgId, "Captain", captain.id);
      const colleague = await crewMember(tx, orgId, "Colleague");
      await tx`insert into public.vessel_crew (org_id, vessel_id, crew_member_id) values (${orgId}, ${mine}, ${me})`;
      const mineDoc = await document(tx, orgId, "vessel", mine, "2030-01-01");
      await document(tx, orgId, "vessel", other, "2030-01-01");
      const myCert = await document(tx, orgId, "crew", me, "2030-01-01");
      await document(tx, orgId, "crew", colleague, "2030-01-01");

      await as(tx, captain.id, async () => {
        const visible = (await tx`select id from public.documents`).map((r) => r.id).sort();
        expect(visible).toEqual([mineDoc, myCert].sort());
        // Personal data: only their own crew record.
        expect((await tx`select id from public.crew_members`).map((r) => r.id)).toEqual([me]);
        // Captains don't edit the fleet.
        expect(await tx`update public.vessels set name = 'Renamed' where id = ${mine} returning id`).toHaveLength(0);
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`insert into public.vessels (org_id, name, type, operating_country_code) values (${orgId}, 'X', 'ferry', 'NG')`,
          ),
        ).toMatch(/row-level security/);
      });
    }));

  it("document status follows the calendar in the org's time zone; reviews win", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const v = await vessel(tx, orgId, "Boat");
      const [today] = await tx`select (now() at time zone 'Africa/Lagos')::date::text as d`;
      const day = (n: number) =>
        new Date(Date.parse(`${today!.d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const ids = {
        valid: await document(tx, orgId, "vessel", v, day(100)),
        expiring: await document(tx, orgId, "vessel", v, day(10)),
        expiringToday: await document(tx, orgId, "vessel", v, day(0)),
        expired: await document(tx, orgId, "vessel", v, day(-1)),
        noExpiry: await document(tx, orgId, "vessel", v, null),
        review: await document(tx, orgId, "vessel", v, day(-30), "needs_review"),
      };
      const rows = await as(
        tx,
        owner.id,
        () => tx`select id, effective_status from public.documents_live where org_id = ${orgId}`,
      );
      const status = new Map(rows.map((r) => [r.id, r.effective_status]));
      expect(status.get(ids.valid)).toBe("valid");
      expect(status.get(ids.expiring)).toBe("expiring");
      expect(status.get(ids.expiringToday)).toBe("expiring");
      expect(status.get(ids.expired)).toBe("expired");
      expect(status.get(ids.noExpiry)).toBe("valid");
      expect(status.get(ids.review)).toBe("needs_review");
    }));

  it("stored files are readable only by those who can see the document", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const stranger = await createUser(tx, "Stranger");
      const orgId = await createOrg(tx, owner.id);
      await createOrg(tx, stranger.id, "Other Org");
      const v = await vessel(tx, orgId, "Boat");
      const path = `${orgId}/vessel/${v}/photo.jpg`;
      await tx`insert into storage.objects (bucket_id, name, owner_id) values ('documents', ${path}, ${owner.id})`;
      await as(tx, owner.id, async () => {
        expect(
          await tx`select name from storage.objects where bucket_id = 'documents' and name = ${path}`,
        ).toHaveLength(1);
      });
      await as(tx, stranger.id, async () => {
        expect(
          await tx`select name from storage.objects where bucket_id = 'documents' and name = ${path}`,
        ).toHaveLength(0);
        // Nor can they upload into someone else's folder.
        expect(
          await rejects(
            tx,
            (sp) =>
              sp`insert into storage.objects (bucket_id, name) values ('documents', ${`${orgId}/vessel/${v}/evil.jpg`})`,
          ),
        ).toMatch(/row-level security/);
      });
      const [bucket] = await tx`select public from storage.buckets where id = 'documents'`;
      expect(bucket?.public).toBe(false);
    }));

  it("document changes are audited", () =>
    inTx(async (tx) => {
      const owner = await createUser(tx, "Owner");
      const orgId = await createOrg(tx, owner.id);
      const v = await vessel(tx, orgId, "Boat");
      const id = await as(tx, owner.id, async () => {
        const [d] = await tx`
          insert into public.documents (org_id, subject_type, subject_id, document_type_code, expiry_date, status)
          values (${orgId}, 'vessel', ${v}, 'insurance', '2030-01-01', 'valid') returning id`;
        await tx`update public.documents set number = 'X1' where id = ${d!.id}`;
        return d!.id as string;
      });
      const audit = await tx`select action, actor_user_id from public.audit_logs where entity_id = ${id} order by at`;
      expect(audit.map((a) => a.action)).toEqual(["document.created", "document.updated"]);
      expect(audit[0]?.actor_user_id).toBe(owner.id);
    }));
});
