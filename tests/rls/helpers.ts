import { createHash, randomUUID } from "node:crypto";
import postgres, { type TransactionSql } from "postgres";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

export type Tx = TransactionSql;
const ROLLBACK = Symbol("rollback");

/** Runs a test inside a transaction that is always rolled back, so tests never leave data behind. */
export async function inTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
}

let counter = 0;
/** Creates an auth user (the profile trigger fills public.profiles) and returns id + E.164 phone. */
export async function createUser(tx: Tx, name = "Test User") {
  counter += 1;
  const id = randomUUID();
  const phone = `+234803${String(Date.now() % 10_000).padStart(4, "0")}${String(counter).padStart(3, "0")}`;
  await tx`
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${phone.slice(1)}, now(), now())`;
  await tx`update public.profiles set full_name = ${name} where id = ${id}`;
  return { id, phone };
}

/** Runs fn as a signed-in user (or anon with null), the way PostgREST would. */
export async function as<T>(tx: Tx, userId: string | null, fn: () => Promise<T>): Promise<T> {
  const claims = userId ? JSON.stringify({ sub: userId, role: "authenticated" }) : JSON.stringify({ role: "anon" });
  await tx.unsafe(`set local role ${userId ? "authenticated" : "anon"}`);
  await tx`select set_config('request.jwt.claims', ${claims}, true)`;
  try {
    return await fn();
  } finally {
    await tx.unsafe("reset role");
    await tx`select set_config('request.jwt.claims', '', true)`;
  }
}

/** Expects the statement to fail, without aborting the surrounding transaction. */
export async function rejects(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<string> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp as unknown as Tx);
    });
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("Expected the statement to fail, but it succeeded");
}

export async function createOrg(tx: Tx, ownerId: string, name = "Org") {
  return as(tx, ownerId, async () => {
    const [row] = await tx`select public.create_org(${name}, 'ferry_operator', 'NG', array['ferry']) as id`;
    return row!.id as string;
  });
}

/** Adds a member directly (as the database owner), bypassing invitations, for test setup. */
export async function addMember(tx: Tx, orgId: string, userId: string, role: string) {
  const [row] = await tx`
    insert into public.memberships (user_id, org_id, role) values (${userId}, ${orgId}, ${role}::public.membership_role)
    returning id`;
  return row!.id as string;
}

export function tokenPair() {
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

/** Records a safety check as the server would (people can't insert checks), for departure tests. */
export async function recordCheck(
  tx: Tx,
  orgId: string,
  tripId: string,
  result: "pass" | "warn" | "block" = "pass",
  reasons: unknown[] = [],
) {
  const [row] = await tx`
    insert into public.safety_checks (org_id, trip_id, checked_at, checked_by, rules_applied, result, reasons)
    values (${orgId}, ${tripId}, now(), gen_random_uuid(), '{}'::jsonb, ${result}::public.safety_result, ${tx.json(reasons as never)})
    returning id`;
  return row!.id as string;
}
