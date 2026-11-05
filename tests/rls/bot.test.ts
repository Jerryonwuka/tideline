import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleInbound } from "@/server/bot/handle";
import { heuristicDraft, type BotContext } from "@/server/bot/parse";
import { createFakeIntegrations, setIntegrationsForTesting, type Integrations } from "@/server/integrations";
import type { FakeLlmClient } from "@/server/integrations/llm/fake";
import type { InboundMessage } from "@/server/integrations/messaging/inbound";
import type { FakeMessagingClient } from "@/server/integrations/messaging/fake";
import type { FakeSttClient } from "@/server/integrations/stt/fake";
import { sql } from "./helpers";

// The bot end to end against the real database (committed rows, cleaned up after), with fake
// WhatsApp, speech-to-text and LLM clients (BUILD_SPEC M9 acceptance).
config({ path: [".env.local", ".env"], quiet: true });

const FIXTURE = "Trip four CMS to Ikorodu eighteen passengers twenty-seven thousand";
const phone = () => `+234809${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const created = { users: [] as string[], orgs: [] as string[] };
let fakes: Integrations;
let s: { orgId: string; ownerPhone: string; captainPhone: string; vesselId: string; routeId: string; ownerId: string };
const logs: string[] = [];

async function user(phoneE164: string, name: string) {
  const id = randomUUID();
  await sql`insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
            values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${phoneE164.slice(1)}, now(), now())`;
  await sql`update public.profiles set phone_e164 = ${phoneE164}, full_name = ${name}, locale = 'en' where id = ${id}`;
  created.users.push(id);
  return id;
}

const msg = (from: string, over: Partial<InboundMessage>): InboundMessage => ({
  channel: "whatsapp",
  providerId: `wamid.${randomUUID()}`,
  fromE164: from,
  at: new Date(),
  type: "text",
  ...over,
});
const sentTo = (to: string) => (fakes.messaging as FakeMessagingClient).sent.filter((m) => m.toE164 === to);
const lastTo = (to: string) => sentTo(to).at(-1)!;
const textOf = (m: ReturnType<typeof lastTo>) => ("body" in m ? m.body : "text" in m ? m.text : "");

beforeAll(async () => {
  fakes = createFakeIntegrations();
  (fakes.llm as FakeLlmClient)
    .respond("voice_log", ({ system, lastUserMessage }: { system: string; lastUserMessage: string }) =>
      heuristicDraft(lastUserMessage, JSON.parse(system.slice(system.indexOf("CONTEXT_JSON ") + 13)) as BotContext),
    )
    .respond("ocr_extract", {
      document_type_code: "laswa_licence",
      number: "LAS-1",
      issuer: "LASWA",
      holder_name: null,
      vessel_name: null,
      issue_date: "2026-01-10",
      expiry_date: "2027-01-09",
      field_confidence: { expiry_date: 0.95 },
      date_format_assumed: "DMY",
      notes: null,
    });
  setIntegrationsForTesting(fakes);
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }

  const ownerPhone = phone();
  const captainPhone = phone();
  const ownerId = await user(ownerPhone, "Owner Bot");
  const captainId = await user(captainPhone, "Captain Bot");
  const [org] =
    await sql`insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region, modes)
                          values ('Bot Test Ferries', 'ferry_operator', 'NG', 'NGN', 'Africa/Lagos', 'en', 'af', '{ferry}') returning id`;
  const orgId = org!.id as string;
  created.orgs.push(orgId);
  await sql`insert into public.memberships (user_id, org_id, role) values (${ownerId}, ${orgId}, 'owner'), (${captainId}, ${orgId}, 'captain')`;
  const [v] =
    await sql`insert into public.vessels (org_id, name, type, operating_country_code, passenger_capacity, ferry_enabled)
                        values (${orgId}, 'MV Lagos One', 'ferry', 'NG', 40, true) returning id`;
  const [c] =
    await sql`insert into public.crew_members (org_id, full_name, crew_role, user_id) values (${orgId}, 'Captain Bot', 'captain', ${captainId}) returning id`;
  await sql`insert into public.vessel_crew (org_id, vessel_id, crew_member_id) values (${orgId}, ${v!.id}, ${c!.id})`;
  const [cms] = await sql`select id from public.jetties where name = 'CMS Marina'`;
  const [ikd] = await sql`select id from public.jetties where name = 'Ikorodu'`;
  const [r] =
    await sql`insert into public.routes (org_id, origin_jetty_id, destination_jetty_id, duration_min, base_fare_minor, currency)
                        values (${orgId}, ${cms!.id}, ${ikd!.id}, 45, 150000, 'NGN') returning id`;
  s = { orgId, ownerPhone, captainPhone, vesselId: v!.id as string, routeId: r!.id as string, ownerId };
});

afterAll(async () => {
  setIntegrationsForTesting(undefined);
  vi.restoreAllMocks();
  for (const id of created.orgs) await sql`delete from public.orgs where id = ${id}`;
  for (const id of created.users) await sql`delete from auth.users where id = ${id}`;
  await sql.end();
});

describe("WhatsApp bot", () => {
  it("a voice note becomes a draft that is saved only after Confirm", async () => {
    const audio = new Uint8Array([1, 2, 3, 4, 5]);
    (fakes.messaging as FakeMessagingClient).putMedia("voice-1", { bytes: audio, mimeType: "audio/ogg" });
    (fakes.stt as FakeSttClient).register(audio, FIXTURE);
    const voice = msg(s.captainPhone, { type: "audio", mediaId: "voice-1", mimeType: "audio/ogg" });
    expect(await handleInbound(voice)).toBe("handled");

    const prompt = lastTo(s.captainPhone);
    expect(prompt.channel).toBe("whatsapp");
    expect("buttons" in prompt && prompt.buttons.map((b) => b.title)).toEqual(["Confirm", "Edit", "Cancel"]);
    expect(textOf(prompt)).toContain("CMS Marina → Ikorodu");
    expect(textOf(prompt)).toContain("18 passengers");
    expect(textOf(prompt)).toContain("27,000");
    const [before] = await sql`select count(*)::int as n from public.trips where org_id = ${s.orgId}`;
    expect(before?.n).toBe(0);

    // The same message again does nothing.
    expect(await handleInbound(voice)).toBe("duplicate");

    const confirmId = "buttons" in prompt ? prompt.buttons[0]!.id : "";
    await handleInbound(msg(s.captainPhone, { type: "button", buttonId: confirmId }));
    expect(textOf(lastTo(s.captainPhone))).toBe("Saved. Thank you.");
    const [trip] =
      await sql`select route_id, vessel_id, passenger_count, takings_cash_minor, source, status from public.trips where org_id = ${s.orgId}`;
    expect(trip).toMatchObject({
      route_id: s.routeId,
      vessel_id: s.vesselId,
      passenger_count: 18,
      takings_cash_minor: "2700000",
      source: "whatsapp_voice",
      status: "arrived",
    });
    const [job] =
      await sql`select kind, status, prompt_version from public.ai_jobs where org_id = ${s.orgId} and kind = 'voice_log'`;
    expect(job).toMatchObject({ kind: "voice_log", status: "done", prompt_version: "voice-log@1" });
  });

  it("asks for a missing field, one question at a time", async () => {
    await handleInbound(msg(s.captainPhone, { text: "Trip from CMS to Ikorodu" }));
    expect(textOf(lastTo(s.captainPhone))).toBe("How many passengers?");
    await handleInbound(msg(s.captainPhone, { text: "twenty two" }));
    expect(textOf(lastTo(s.captainPhone))).toContain("22 passengers");
    await handleInbound(msg(s.captainPhone, { text: "no" }));
    expect(textOf(lastTo(s.captainPhone))).toBe("Cancelled. Nothing was saved.");
  });

  it("logs fuel as an expense on Confirm", async () => {
    await handleInbound(msg(s.captainPhone, { text: "Fuel 40k" }));
    const prompt = lastTo(s.captainPhone);
    await handleInbound(
      msg(s.captainPhone, { type: "button", buttonId: "buttons" in prompt ? prompt.buttons[0]!.id : "" }),
    );
    const [e] = await sql`select category, amount_minor, source from public.expenses where org_id = ${s.orgId}`;
    expect(e).toMatchObject({ category: "fuel", amount_minor: "4000000", source: "whatsapp_text" });
  });

  it("an urgent message alerts the owner by WhatsApp and SMS at once and creates an incident", async () => {
    const started = Date.now();
    await handleInbound(msg(s.captainPhone, { text: "Boat don capsize near Ikorodu, two people missing" }));
    const alerts = sentTo(s.ownerPhone).filter((m) => "text" in m && m.text.startsWith("URGENT"));
    expect(alerts.map((m) => m.channel).sort()).toEqual(["sms", "whatsapp"]);
    expect(Date.now() - started).toBeLessThan(60_000);
    expect(textOf(lastTo(s.captainPhone))).toContain("emergency services");
    const [incident] =
      await sql`select urgent, source, status, escalated_at from public.incidents where org_id = ${s.orgId}`;
    expect(incident).toMatchObject({ urgent: true, source: "whatsapp_text", status: "open" });
    expect(incident?.escalated_at).not.toBeNull();
  });

  it("a certificate photo goes into the review queue", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    (fakes.messaging as FakeMessagingClient).putMedia("photo-1", { bytes: png, mimeType: "image/png" });
    await handleInbound(msg(s.captainPhone, { type: "image", mediaId: "photo-1", mimeType: "image/png" }));
    expect(textOf(lastTo(s.captainPhone))).toContain("review queue");
    const [doc] =
      await sql`select status, extracted is not null as has_draft from public.documents where org_id = ${s.orgId}`;
    expect(doc).toMatchObject({ status: "needs_review", has_draft: true });
  });

  it("the SMS fallback format is confirmed by replying YES", async () => {
    const sms = (text: string): InboundMessage => ({
      ...msg(s.captainPhone, { text }),
      channel: "sms",
      providerId: `sms-${randomUUID()}`,
    });
    await handleInbound(sms("TRIP 4 CMS IKD 18 27000"));
    const prompt = lastTo(s.captainPhone);
    expect(prompt.channel).toBe("sms");
    expect(textOf(prompt)).toContain("Reply YES");
    await handleInbound(sms("YES"));
    const [trip] = await sql`select passenger_count from public.trips where org_id = ${s.orgId} and source = 'sms'`;
    expect(trip?.passenger_count).toBe(18);
  });

  it("unknown numbers only get a sign-up link, and nothing they said is kept", async () => {
    const stranger = phone();
    const m = msg(stranger, { text: "Trip 4, my name is Bola, call me" });
    expect(await handleInbound(m)).toBe("unknown_sender");
    expect(textOf(lastTo(stranger))).toContain("/login");
    const [row] = await sql`select org_id, transcript from public.wa_messages where wa_message_id = ${m.providerId}`;
    expect(row).toMatchObject({ org_id: null, transcript: null });
  });

  it("the owner can decide a safety override from WhatsApp", async () => {
    const [t] =
      await sql`insert into public.trips (org_id, vessel_id, origin_text, destination_text, currency, lifejackets_confirmed)
                          values (${s.orgId}, ${s.vesselId}, 'A', 'B', 'NGN', true) returning id`;
    const [c] =
      await sql`insert into public.safety_checks (org_id, trip_id, checked_at, checked_by, rules_applied, result, reasons)
                          values (${s.orgId}, ${t!.id}, now(), ${s.ownerId}, '{}', 'block', '[{"code":"wind","severity":"block","overridable":true}]') returning id`;
    const [r] = await sql`insert into public.safety_override_requests (org_id, trip_id, safety_check_id, requested_by)
                          values (${s.orgId}, ${t!.id}, ${c!.id}, ${s.ownerId}) returning id`;
    await handleInbound(msg(s.captainPhone, { type: "button", buttonId: `override:${r!.id}:approved` }));
    expect(textOf(lastTo(s.captainPhone))).toBe("Only the owner can decide overrides.");
    await handleInbound(msg(s.ownerPhone, { type: "button", buttonId: `override:${r!.id}:approved` }));
    expect(textOf(lastTo(s.ownerPhone))).toContain("Override approved");
    const [o] = await sql`select decision, decided_by from public.safety_overrides where request_id = ${r!.id}`;
    expect(o).toMatchObject({ decision: "approved", decided_by: s.ownerId });
  });

  it("logs never contain a phone number", () => {
    const digits = [s.ownerPhone, s.captainPhone].flatMap((p) => [p, p.slice(1), p.slice(4)]);
    for (const line of logs) for (const d of digits) expect(line).not.toContain(d);
  });
});
