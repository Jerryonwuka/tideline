import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { FakeMessagingClient } from "@/server/integrations/messaging/fake";
import { runExpiryAlerts } from "@/server/jobs/expiry-alerts";
import { sql } from "./helpers";

config({ path: [".env.local", ".env"], quiet: true });

// The alerts job against the real database, with committed data (the job uses its own connection),
// cleaned up afterwards.
const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

const created = { users: [] as string[], orgs: [] as string[] };

async function setupOrg(timeZone: string, expiry: string) {
  const user = randomUUID();
  const phone = `+234809${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  await sql`insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
            values (${user}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${phone.slice(1)}, now(), now())`;
  const [org] = await sql`
    insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
    values (${`Alerts ${timeZone}`}, 'ferry_operator', 'NG', 'NGN', ${timeZone}, 'en', 'af', '{ferry}') returning id`;
  await sql`insert into public.memberships (user_id, org_id, role) values (${user}, ${org!.id}, 'owner')`;
  const [vessel] =
    await sql`insert into public.vessels (org_id, name, type, operating_country_code) values (${org!.id}, 'MV Alert', 'ferry', 'NG') returning id`;
  const [doc] = await sql`
    insert into public.documents (org_id, subject_type, subject_id, document_type_code, expiry_date, status)
    values (${org!.id}, 'vessel', ${vessel!.id}, 'insurance', ${expiry}, 'valid') returning id`;
  created.users.push(user);
  created.orgs.push(org!.id);
  return { orgId: org!.id as string, docId: doc!.id as string, phone, userId: user };
}

afterAll(async () => {
  for (const id of created.orgs) await sql`delete from public.orgs where id = ${id}`;
  for (const id of created.users) await sql`delete from auth.users where id = ${id}`;
  await sql.end();
});

describe("alerts-expiry job", () => {
  // 2026-11-04 06:00 UTC = 07:00 in Lagos (UTC+1) and 00:00 in Chicago (UTC-6).
  const lagosSeven = new Date("2026-11-04T06:00:00Z");
  // 13:00 UTC the same day = 07:00 in Chicago.
  const chicagoSeven = new Date("2026-11-04T13:00:00Z");
  let lagos: Awaited<ReturnType<typeof setupOrg>>;
  let chicago: Awaited<ReturnType<typeof setupOrg>>;

  beforeAll(async () => {
    lagos = await setupOrg("Africa/Lagos", "2026-12-04"); // 30 days from 4 Nov
    chicago = await setupOrg("America/Chicago", "2026-11-18"); // 14 days from 4 Nov
  });

  it("sends each due alert once, even when the job runs twice", async () => {
    const messaging = new FakeMessagingClient();
    const deps = { db: admin, messaging, appUrl: "http://localhost:3000", now: lagosSeven };
    const first = await runExpiryAlerts(deps, { orgIds: [lagos.orgId, chicago.orgId] });
    const second = await runExpiryAlerts(deps, { orgIds: [lagos.orgId, chicago.orgId] });

    expect(first).toMatchObject({ orgsAtAlertHour: 1, alertsClaimed: 2, messagesSent: 1 });
    expect(second).toMatchObject({ orgsAtAlertHour: 1, alertsClaimed: 0, messagesSent: 0 });
    expect(messaging.sent.filter((m) => m.toE164 === lagos.phone)).toHaveLength(1);

    const alerts =
      await sql`select offset_days, channel, status from public.document_alerts where document_id = ${lagos.docId} order by channel::text`;
    expect(alerts).toEqual([
      { offset_days: 30, channel: "in_app", status: "sent" },
      { offset_days: 30, channel: "whatsapp", status: "sent" },
    ]);
    const notes = await sql`select template, payload from public.notifications where user_id = ${lagos.userId}`;
    expect(notes).toHaveLength(1);
    expect(notes[0]?.payload).toMatchObject({ documentId: lagos.docId, days: 30, subject: "MV Alert" });
  });

  it("an org in another time zone gets its alert at its own 07:00", async () => {
    const messaging = new FakeMessagingClient();
    const atLagosSeven = await runExpiryAlerts(
      { db: admin, messaging, appUrl: "", now: lagosSeven },
      { orgIds: [chicago.orgId] },
    );
    expect(atLagosSeven.orgsAtAlertHour).toBe(0);

    const atChicagoSeven = await runExpiryAlerts(
      { db: admin, messaging, appUrl: "", now: chicagoSeven },
      { orgIds: [chicago.orgId] },
    );
    expect(atChicagoSeven).toMatchObject({ orgsAtAlertHour: 1, messagesSent: 1 });
    const [alert] =
      await sql`select offset_days from public.document_alerts where document_id = ${chicago.docId} and channel = 'whatsapp'`;
    expect(alert?.offset_days).toBe(14);
  });

  it("falls back to SMS when WhatsApp fails", async () => {
    const org = await setupOrg("Africa/Lagos", "2026-11-11"); // 7 days
    const messaging = new FakeMessagingClient();
    const failingWhatsApp = {
      ...messaging,
      send: (m: Parameters<FakeMessagingClient["send"]>[0]) =>
        m.channel === "whatsapp"
          ? Promise.resolve({ providerMessageId: "x", status: "failed" as const })
          : messaging.send(m),
      sendOtp: messaging.sendOtp.bind(messaging),
      downloadWhatsAppMedia: messaging.downloadWhatsAppMedia.bind(messaging),
    };
    const summary = await runExpiryAlerts(
      { db: admin, messaging: failingWhatsApp, appUrl: "http://x", now: lagosSeven },
      { orgIds: [org.orgId] },
    );
    expect(summary).toMatchObject({ messagesSent: 1, smsFallbacks: 1 });
    const sms = messaging.sent.find((m) => m.channel === "sms" && m.toE164 === org.phone);
    expect(sms && "text" in sms && sms.text).toMatch(/Insurance for MV Alert expires on .* \(in 7 days\)/);
  });
});
