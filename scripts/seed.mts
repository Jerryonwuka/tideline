/**
 * Development seed (`pnpm db:seed`): two orgs with owners, a captain and a platform admin.
 * Idempotent. Log in locally with any of the phones below; the OTP prints in the dev server console.
 * Vessels, crew records and trips are added by later milestones.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required (see .env.example)");

// Test numbers only; not real people.
const USERS = {
  ownerA: { phone: "+2348030000001", name: "Ada Okafor (seed)" },
  captainA: { phone: "+2348030000002", name: "Tunde Adeyemi (seed)" },
  ownerB: { phone: "+2348030000003", name: "Chidi Nwosu (seed)" },
  admin: { phone: "+2348030000009", name: "Tideline Admin (seed)" },
} as const;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const sql = postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

async function ensureUser(phone: string, name: string): Promise<string> {
  const [existing] = await sql`select id from public.profiles where phone_e164 = ${phone}`;
  let id = existing?.id as string | undefined;
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({ phone, phone_confirm: true });
    if (error || !data.user) throw new Error(`Could not create seed user: ${error?.message}`);
    id = data.user.id;
  }
  await sql`update public.profiles set full_name = ${name} where id = ${id}`;
  return id;
}

async function ensureOrg(name: string, type: string, modes: string[], ownerId: string): Promise<string> {
  const [existing] = await sql`select id from public.orgs where name = ${name}`;
  if (existing) return existing.id as string;
  // Currency, zone, locale and data region come from the country, as in create_org().
  const [org] = await sql`
    insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes, region)
    select ${name}, ${type}::public.org_type, c.code, c.default_currency, c.default_time_zone, c.default_locale,
           c.data_region, ${modes}, 'Lagos'
    from public.countries c where c.code = 'NG'
    returning id`;
  await sql`insert into public.memberships (user_id, org_id, role) values (${ownerId}, ${org!.id}, 'owner')`;
  return org!.id as string;
}

try {
  const ids = Object.fromEntries(
    await Promise.all(Object.entries(USERS).map(async ([key, u]) => [key, await ensureUser(u.phone, u.name)] as const)),
  ) as Record<keyof typeof USERS, string>;

  const lagoon = await ensureOrg("Lagoon Ferries (seed)", "ferry_operator", ["ferry"], ids.ownerA);
  await ensureOrg("Harbour Marine Services (seed)", "vessel_owner", ["charter"], ids.ownerB);
  await sql`
    insert into public.memberships (user_id, org_id, role) values (${ids.captainA}, ${lagoon}, 'captain')
    on conflict (user_id, org_id) do nothing`;
  await sql`insert into public.platform_admins (user_id) values (${ids.admin}) on conflict do nothing`;

  console.info("Seeded 2 orgs, 4 users. Phones are listed in scripts/seed.mts.");
} finally {
  await sql.end();
}
