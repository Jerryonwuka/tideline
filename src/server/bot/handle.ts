import "server-only";
import { randomUUID } from "node:crypto";
import { createTranslator } from "next-intl";
import { speechFor } from "@/config/languages";
import type { Json } from "@/lib/database.types";
import { formatMoney, fromMajor } from "@/lib/money";
import { defaultLocale, isLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import {
  VOICE_LOG_PROMPT_ID,
  VOICE_LOG_PROMPT_VERSION,
  voiceLogSchema,
  voiceLogSystemPrompt,
} from "@/server/ai/prompts/voice-log";
import { serverEnv } from "@/server/env";
import { integrations, type Integrations } from "@/server/integrations";
import type { InboundMessage } from "@/server/integrations/messaging/inbound";
import { hashPhone } from "@/server/privacy";
import { DOCUMENTS_BUCKET } from "@/server/services/documents";
import { runExtraction } from "@/server/services/extraction";
import { supabaseAdmin, type AdminDb } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { ASSISTANT_ROLES, assistantContext } from "@/server/assistant/context";
import { askAssistant } from "@/server/assistant/run";
import { applyAnswer, missingFields, parseTripSms, type BotContext, type BotDraft } from "./parse";

// §10.2 WhatsApp (and SMS) bot. Every inbound message is handled once (wa_message_id). Unknown
// numbers only get a sign-up link. Nothing a captain says becomes a record until they press
// Confirm (or reply YES by SMS); missing fields are asked one at a time. Danger is escalated at
// once. Photos of certificates go into the review queue. Phone numbers are never logged.

type Translate = (key: string, values?: Record<string, string | number>) => string;
type Source = "whatsapp_voice" | "whatsapp_text" | "sms";

interface Sender {
  userId: string;
  orgId: string;
  role: string;
  crewId: string | null;
  fullName: string | null;
  locale: string;
  org: {
    name: string;
    country_code: string;
    currency: string;
    default_locale: string;
    settings: unknown;
    countryName: string;
  };
}

interface Turn {
  db: AdminDb;
  deps: Pick<Integrations, "messaging" | "stt" | "llm">;
  msg: InboundMessage;
  rowId: string;
  sender: Sender;
  t: Translate;
}

export type InboundOutcome = "duplicate" | "unknown_sender" | "handled";

async function translator(locale: string): Promise<Translate> {
  const l = isLocale(locale) ? locale : defaultLocale;
  return createTranslator({ locale: l, messages: await loadMessages(l) }) as unknown as Translate;
}

const appUrl = () => serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

// ----- Sending -------------------------------------------------------------------------------------

async function send(
  db: AdminDb,
  deps: Turn["deps"],
  msg: Pick<InboundMessage, "channel" | "fromE164">,
  orgId: string | null,
  text: string,
  buttons?: { id: string; title: string }[],
) {
  const result =
    msg.channel === "whatsapp" && buttons?.length
      ? await deps.messaging.send({
          channel: "whatsapp",
          kind: "interactive",
          toE164: msg.fromE164,
          body: text,
          buttons,
        })
      : await deps.messaging.send({ channel: msg.channel, kind: "text", toE164: msg.fromE164, text } as never);
  await db.from("wa_messages").insert({
    org_id: orgId,
    direction: "out",
    channel: msg.channel,
    phone_hash: hashPhone(msg.fromE164),
    wa_message_id: result.providerMessageId || `out-${randomUUID()}`,
    type: buttons?.length ? "interactive" : "text",
    transcript: text,
  });
}

const reply = (turn: Turn, text: string, buttons?: { id: string; title: string }[]) =>
  send(turn.db, turn.deps, turn.msg, turn.sender.orgId, text, buttons);

// ----- Who is writing ------------------------------------------------------------------------------

async function identify(db: AdminDb, phoneE164: string): Promise<Sender | null> {
  const { data: profile } = await db
    .from("profiles")
    .select("id, full_name, locale")
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (!profile) return null;
  const [{ data: session }, { data: memberships }] = await Promise.all([
    db.from("bot_sessions").select("org_id").eq("user_id", profile.id).maybeSingle(),
    db
      .from("memberships")
      .select("org_id, role, created_at")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .order("created_at"),
  ]);
  const membership = memberships?.find((m) => m.org_id === session?.org_id) ?? memberships?.[0];
  if (!membership) return null;
  const [{ data: org }, { data: crew }] = await Promise.all([
    db
      .from("orgs")
      .select("name, country_code, currency, default_locale, settings, countries(name)")
      .eq("id", membership.org_id)
      .single(),
    db
      .from("crew_members")
      .select("id")
      .eq("org_id", membership.org_id)
      .eq("user_id", profile.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (!org) return null;
  return {
    userId: profile.id,
    orgId: membership.org_id,
    role: membership.role,
    crewId: crew?.id ?? null,
    fullName: profile.full_name,
    locale: profile.locale ?? org.default_locale,
    org: { ...org, countryName: org.countries?.name ?? org.country_code },
  };
}

/** Vessels the sender can log for (the office: all ferry vessels; crew: their assigned ones). */
async function botContext(db: AdminDb, s: Sender): Promise<BotContext> {
  let vessels: { id: string; name: string }[];
  if (s.role === "owner" || s.role === "manager") {
    vessels = (await db.from("vessels").select("id, name").eq("org_id", s.orgId).order("name")).data ?? [];
  } else {
    const { data } = await db
      .from("vessel_crew")
      .select("vessel:vessels(id, name)")
      .eq("crew_member_id", s.crewId ?? "00000000-0000-0000-0000-000000000000")
      .is("to_date", null);
    vessels = (data ?? []).flatMap((a) => (a.vessel ? [a.vessel] : []));
  }
  const [{ data: routes }, { data: open }] = await Promise.all([
    db
      .from("routes")
      .select(
        "id, origin:jetties!routes_origin_jetty_id_jetties_id_fk(name, aliases), destination:jetties!routes_destination_jetty_id_jetties_id_fk(name, aliases)",
      )
      .eq("org_id", s.orgId)
      .eq("active", true),
    db
      .from("trips")
      .select(
        "id, origin_text, destination_text, route:routes(origin:jetties!routes_origin_jetty_id_jetties_id_fk(name), destination:jetties!routes_destination_jetty_id_jetties_id_fk(name))",
      )
      .eq("org_id", s.orgId)
      .in("status", ["boarding", "departed"])
      .in(
        "vessel_id",
        vessels.map((v) => v.id),
      ),
  ]);
  return {
    vessels,
    routes: (routes ?? []).map((r) => ({
      id: r.id,
      origin: r.origin?.name ?? "",
      destination: r.destination?.name ?? "",
      originAliases: r.origin?.aliases ?? [],
      destinationAliases: r.destination?.aliases ?? [],
    })),
    openTrips: (open ?? []).map((t) => ({
      id: t.id,
      label: `${t.route?.origin?.name ?? t.origin_text ?? "?"} → ${t.route?.destination?.name ?? t.destination_text ?? "?"}`,
    })),
    currency: s.org.currency,
  };
}

// ----- Entry point ---------------------------------------------------------------------------------

/** Handles one inbound WhatsApp or SMS message. Idempotent by provider message id. */
export async function handleInbound(msg: InboundMessage, deps: Turn["deps"] = integrations()): Promise<InboundOutcome> {
  const db = supabaseAdmin();
  const sender = await identify(db, msg.fromE164);
  const { data: row } = await db
    .from("wa_messages")
    .upsert(
      {
        org_id: sender?.orgId ?? null,
        user_id: sender?.userId ?? null,
        direction: "in",
        channel: msg.channel,
        phone_hash: hashPhone(msg.fromE164),
        wa_message_id: msg.providerId,
        type: msg.type,
        // Unknown senders: keep only the message id (§10.2).
        transcript: sender ? (msg.text ?? null) : null,
      },
      { onConflict: "channel,wa_message_id", ignoreDuplicates: true },
    )
    .select("id");
  if (!row?.length) return "duplicate";

  if (!sender) {
    const t = await translator(defaultLocale);
    await send(db, deps, msg, null, t("bot.signUp", { link: `${appUrl()}/login` }));
    return "unknown_sender";
  }
  const turn: Turn = { db, deps, msg, rowId: row[0]!.id, sender, t: await translator(sender.locale) };
  try {
    await dispatch(turn);
  } catch (err) {
    console.error("[bot] message failed", {
      from: hashPhone(msg.fromE164),
      error: err instanceof Error ? err.name : typeof err,
    });
    await db.from("wa_messages").update({ state: "failed" }).eq("id", turn.rowId);
    await reply(turn, turn.t("bot.notUnderstood")).catch(() => null);
  }
  return "handled";
}

async function dispatch(turn: Turn) {
  const { msg } = turn;
  if (msg.type === "button" && msg.buttonId) return onButton(turn, msg.buttonId);
  if (msg.type === "image" || msg.type === "document") return onPhoto(turn);
  if (msg.type === "audio") return onVoice(turn);
  if (msg.type === "text" && msg.text) return onText(turn, msg.text, msg.channel === "sms" ? "sms" : "whatsapp_text");
  return reply(turn, turn.t("bot.help"));
}

// ----- Text, voice and drafts ----------------------------------------------------------------------

const YES = /^\s*(yes|y|ok|okay|confirm|save|correct|na so)\s*[.!]?\s*$/i;
const NO = /^\s*(no|n|cancel|stop)\s*[.!]?\s*$/i;

async function session(turn: Turn) {
  const { data } = await turn.db.from("bot_sessions").select("*").eq("user_id", turn.sender.userId).maybeSingle();
  return data;
}

async function onVoice(turn: Turn) {
  const { msg, deps, db } = turn;
  const media = await deps.messaging.downloadWhatsAppMedia(msg.mediaId!);
  const transcript = await deps.stt.transcribe({
    audio: media.bytes,
    mimeType: media.mimeType,
    languageHints: speechFor(turn.sender.org.country_code, turn.sender.locale).sttHints,
  });
  await db.from("wa_messages").update({ transcript: transcript.text }).eq("id", turn.rowId);
  return onText(turn, transcript.text, "whatsapp_voice");
}

async function onText(turn: Turn, text: string, source: Source) {
  const open = await session(turn);
  if (open && YES.test(text) && !open.asking) return confirm(turn, open.message_id);
  if (open && NO.test(text)) return cancel(turn, open.message_id);
  const ctx = await botContext(turn.db, turn.sender);
  if (open?.asking) {
    const draft = applyAnswer(open.draft as unknown as BotDraft, open.asking, text, ctx);
    return progress(turn, draft, ctx, open.message_id, source);
  }
  const draft = (source === "sms" ? parseTripSms(text, ctx) : null) ?? (await extract(turn, text, ctx));
  if (!draft) return reply(turn, turn.t("bot.notUnderstood"));
  await turn.db
    .from("wa_messages")
    .update({ parsed: draft as unknown as Json })
    .eq("id", turn.rowId);
  if (draft.kind === "incident" || draft.urgent) return escalate(turn, text, source, ctx);
  if (draft.kind === "other") return answerQuestion(turn, text);
  return progress(
    turn,
    { ...draft, summary_for_confirmation: draft.summary_for_confirmation },
    ctx,
    turn.rowId,
    source,
  );
}

/** §10.2 extraction with context; output validated, one retry with the error, ai_jobs logged. */
async function extract(turn: Turn, text: string, ctx: BotContext): Promise<BotDraft | null> {
  const started = Date.now();
  const system = voiceLogSystemPrompt({
    countryName: turn.sender.org.countryName,
    languages: speechFor(turn.sender.org.country_code, turn.sender.locale).description,
    currency: turn.sender.org.currency,
    bot: ctx,
  });
  let lastError = "no output";
  let usage = { model: null as string | null, tokensIn: 0, tokensOut: 0 };
  let result: BotDraft | null = null;
  for (let attempt = 1; attempt <= 2 && !result; attempt++) {
    const messages = [
      { role: "user" as const, content: text },
      ...(attempt > 1
        ? [
            {
              role: "user" as const,
              content: `Your previous answer was invalid: ${lastError}. Return JSON matching the schema.`,
            },
          ]
        : []),
    ];
    try {
      const out = await turn.deps.llm.generateStructured({
        promptId: VOICE_LOG_PROMPT_ID,
        promptVersion: VOICE_LOG_PROMPT_VERSION,
        system,
        messages,
        schema: voiceLogSchema,
        schemaName: "voice_log",
      });
      usage = {
        model: out.usage.model,
        tokensIn: usage.tokensIn + out.usage.tokensIn,
        tokensOut: usage.tokensOut + out.usage.tokensOut,
      };
      const parsed = voiceLogSchema.safeParse(out.raw);
      if (parsed.success) {
        // Ids must come from the context; anything else is dropped rather than trusted.
        const d = parsed.data;
        result = {
          ...d,
          vessel_id: ctx.vessels.some((v) => v.id === d.vessel_id) ? d.vessel_id : null,
          route_id: ctx.routes.some((r) => r.id === d.route_id) ? d.route_id : null,
        };
      } else lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (err) {
      lastError = err instanceof Error ? err.message : "error";
    }
  }
  await turn.db.from("ai_jobs").insert({
    org_id: turn.sender.orgId,
    kind: "voice_log",
    input_ref: `wa_message:${turn.rowId}`,
    prompt_version: VOICE_LOG_PROMPT_VERSION,
    model: usage.model,
    tokens_in: usage.tokensIn,
    tokens_out: usage.tokensOut,
    latency_ms: Date.now() - started,
    status: result ? "done" : "failed",
    output: (result as unknown as Json) ?? null,
    error: result ? null : lastError.slice(0, 500),
  });
  return result;
}

/** Ask for the next missing field, or show the summary with Confirm / Edit / Cancel. */
async function progress(turn: Turn, draft: BotDraft, ctx: BotContext, messageId: string, source: Source) {
  const missing = missingFields(draft);
  const next = missing[0] ?? null;
  await turn.db.from("bot_sessions").upsert({
    user_id: turn.sender.userId,
    org_id: turn.sender.orgId,
    channel: turn.msg.channel,
    message_id: messageId,
    draft: { ...draft, source } as unknown as NonNullable<Json>,
    asking: next,
    updated_at: new Date().toISOString(),
  });
  await turn.db
    .from("wa_messages")
    .update({ parsed: draft as unknown as Json, state: next ? "received" : "awaiting_confirm" })
    .eq("id", messageId);
  if (next) {
    const options =
      next === "vessel_id"
        ? ctx.vessels.map((v, i) => `${i + 1}. ${v.name}`).join("  ")
        : next === "route"
          ? ctx.routes.map((r, i) => `${i + 1}. ${r.origin} → ${r.destination}`).join("  ")
          : "";
    return reply(turn, turn.t(`bot.ask.${next}`, { options }));
  }
  const summary = summarise(turn, draft, ctx);
  if (turn.msg.channel === "sms") return reply(turn, `${summary} ${turn.t("bot.confirmSms")}`);
  return reply(turn, `${summary} ${turn.t("bot.confirmQuestion")}`, [
    { id: `bot:confirm:${messageId}`, title: turn.t("bot.buttons.confirm") },
    { id: `bot:edit:${messageId}`, title: turn.t("bot.buttons.edit") },
    { id: `bot:cancel:${messageId}`, title: turn.t("bot.buttons.cancel") },
  ]);
}

/** Our own summary from the validated fields (never the model's free text). */
function summarise(turn: Turn, d: BotDraft, ctx: BotContext): string {
  const { t } = turn;
  const vessel = ctx.vessels.find((v) => v.id === d.vessel_id)?.name ?? t("bot.unknownVessel");
  const amount =
    d.amount != null ? formatMoney(fromMajor(String(d.amount), d.currency ?? ctx.currency), turn.sender.locale) : "";
  const method = d.payment_method === "transfer" ? t("bot.transfer") : d.payment_method === "cash" ? t("bot.cash") : "";
  if (d.kind === "trip_log") {
    const route = ctx.routes.find((r) => r.id === d.route_id);
    return t("bot.summary.trip_log", {
      route: route ? `${route.origin} → ${route.destination}` : `${d.origin} → ${d.destination}`,
      vessel,
      passengers: d.passenger_count ?? 0,
      amount: amount ? t("bot.summary.amount", { amount, method }).trimEnd() : "",
    });
  }
  if (d.kind === "fuel") return t("bot.summary.fuel", { vessel, amount });
  return t("bot.summary.expense", { category: d.expense_category ?? "other", vessel, amount });
}

// ----- Questions → assistant (owners and managers) -------------------------------------------------

async function answerQuestion(turn: Turn, text: string) {
  if (!ASSISTANT_ROLES.includes(turn.sender.role)) return reply(turn, turn.t("bot.help"));
  const ctx = await assistantContext(turn.db, turn.sender.orgId, turn.sender.locale, "whatsapp");
  const { text: answer } = await askAssistant(ctx, text);
  // WhatsApp: at most 5 lines (§10.6).
  return reply(turn, answer.split("\n").slice(0, 5).join("\n") || turn.t("bot.help"));
}

// ----- Buttons -------------------------------------------------------------------------------------

async function onButton(turn: Turn, id: string) {
  const [scope, a, b] = id.split(":");
  if (scope === "bot" && b) {
    if (a === "confirm") return confirm(turn, b);
    if (a === "cancel") return cancel(turn, b);
    if (a === "edit") {
      await clearSession(turn, b, "cancelled");
      return reply(turn, turn.t("bot.edit"));
    }
  }
  if (scope === "override" && a && (b === "approved" || b === "declined")) return decideOverride(turn, a, b);
  return reply(turn, turn.t("bot.help"));
}

async function clearSession(turn: Turn, messageId: string, state: "confirmed" | "cancelled") {
  await turn.db.from("bot_sessions").delete().eq("user_id", turn.sender.userId).eq("message_id", messageId);
  await turn.db.from("wa_messages").update({ state }).eq("id", messageId);
}

async function cancel(turn: Turn, messageId: string) {
  await clearSession(turn, messageId, "cancelled");
  return reply(turn, turn.t("bot.cancelled"));
}

async function confirm(turn: Turn, messageId: string) {
  const open = await session(turn);
  if (!open || open.message_id !== messageId || open.asking) return reply(turn, turn.t("bot.nothingPending"));
  const draft = open.draft as unknown as BotDraft & { source: Source };
  const ctx = await botContext(turn.db, turn.sender);
  if (draft.vessel_id && !ctx.vessels.some((v) => v.id === draft.vessel_id))
    return reply(turn, turn.t("bot.notAllowed"));
  const { db, sender } = turn;
  let linked: { type: string; id: string };
  if (draft.kind === "trip_log") {
    const route = ctx.routes.find((r) => r.id === draft.route_id);
    const amountMinor =
      draft.amount != null ? Number(fromMajor(String(draft.amount), sender.org.currency).amountMinor) : 0;
    const now = new Date().toISOString();
    // A record of a finished trip, as the captain reported it (shown with its source).
    const { data, error } = await db
      .from("trips")
      .insert({
        org_id: sender.orgId,
        vessel_id: draft.vessel_id!,
        route_id: route?.id ?? null,
        origin_text: route ? null : draft.origin,
        destination_text: route ? null : draft.destination,
        captain_crew_id: sender.crewId,
        status: "arrived",
        passenger_count: draft.passenger_count ?? 0,
        takings_cash_minor: draft.payment_method === "transfer" ? 0 : amountMinor,
        takings_digital_minor: draft.payment_method === "transfer" ? amountMinor : 0,
        currency: sender.org.currency,
        source: draft.source,
        scheduled_departure: now,
        actual_arrival: now,
        client_id: messageId,
        notes: draft.summary_for_confirmation.slice(0, 500),
      })
      .select("id")
      .single();
    if (error) throw new Error(`trip log: ${error.code}`);
    linked = { type: "trip", id: data.id };
  } else {
    const { data, error } = await db
      .from("expenses")
      .insert({
        org_id: sender.orgId,
        vessel_id: draft.vessel_id,
        category: draft.kind === "fuel" ? "fuel" : (draft.expense_category ?? "other"),
        amount_minor: String(fromMajor(String(draft.amount ?? 0), sender.org.currency).amountMinor),
        currency: sender.org.currency,
        payment_method: draft.payment_method,
        note: draft.summary_for_confirmation.slice(0, 500),
        source: draft.source,
        recorded_by: sender.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(`expense: ${error.code}`);
    linked = { type: "expense", id: data.id };
  }
  await db
    .from("wa_messages")
    .update({ linked_entity_type: linked.type, linked_entity_id: linked.id })
    .eq("id", messageId);
  await clearSession(turn, messageId, "confirmed");
  return reply(turn, turn.t("bot.saved"));
}

// ----- Emergencies ---------------------------------------------------------------------------------

/** Urgent: incident row, owners and managers alerted by WhatsApp and SMS straight away (§10.2). */
async function escalate(turn: Turn, text: string, source: Source, ctx: BotContext) {
  const { db, sender, deps } = turn;
  const { data: trip } = await db
    .from("trips")
    .select("id, vessel_id")
    .eq("org_id", sender.orgId)
    .eq("status", "departed")
    .in(
      "vessel_id",
      ctx.vessels.map((v) => v.id),
    )
    .order("actual_departure", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: incident } = await db
    .from("incidents")
    .insert({
      org_id: sender.orgId,
      trip_id: trip?.id ?? null,
      vessel_id: trip?.vessel_id ?? (ctx.vessels.length === 1 ? ctx.vessels[0]!.id : null),
      reported_by: sender.userId,
      source,
      description: text.slice(0, 2000),
      urgent: true,
      escalated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  await db
    .from("wa_messages")
    .update({ linked_entity_type: "incident", linked_entity_id: incident?.id ?? null, state: "confirmed" })
    .eq("id", turn.rowId);

  const { data: managers } = await db
    .from("memberships")
    .select("user_id, profile:profiles!memberships_user_id_profiles_id_fk(phone_e164)")
    .eq("org_id", sender.orgId)
    .eq("status", "active")
    .in("role", ["owner", "manager"]);
  const alert = turn.t("bot.incidentAlert", { who: sender.fullName ?? "?", text: text.slice(0, 600) });
  await db.from("notifications").insert(
    (managers ?? []).map((m) => ({
      org_id: sender.orgId,
      user_id: m.user_id,
      template: "incident",
      payload: { text: text.slice(0, 600), incidentId: incident?.id },
    })),
  );
  await Promise.all(
    (managers ?? []).flatMap((m) =>
      m.profile?.phone_e164
        ? [
            deps.messaging
              .send({ channel: "whatsapp", kind: "text", toE164: m.profile.phone_e164, text: alert })
              .catch(() => null),
            deps.messaging
              .send({ channel: "sms", kind: "text", toE164: m.profile.phone_e164, text: alert })
              .catch(() => null),
          ]
        : [],
    ),
  );
  return reply(turn, turn.t("bot.incident"));
}

// ----- Photos → review queue ---------------------------------------------------------------------

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

async function onPhoto(turn: Turn) {
  const { db, sender, msg, deps } = turn;
  const media = await deps.messaging.downloadWhatsAppMedia(msg.mediaId!);
  const ext = EXT[media.mimeType];
  if (!ext) return reply(turn, turn.t("bot.photoFailed"));
  const path = `${sender.orgId}/org/${sender.orgId}/${randomUUID()}.${ext}`;
  const upload = await db.storage.from(DOCUMENTS_BUCKET).upload(path, media.bytes, { contentType: media.mimeType });
  if (upload.error) return reply(turn, turn.t("bot.photoFailed"));
  // Filed under the company as "other"; the extraction suggests the real type and the reviewer
  // sets it (and the vessel or person it belongs to) when confirming.
  const { data: doc, error } = await db
    .from("documents")
    .insert({
      org_id: sender.orgId,
      subject_type: "org",
      subject_id: sender.orgId,
      document_type_code: "other",
      file_path: path,
      status: "needs_review",
    })
    .select("id")
    .single();
  if (error) return reply(turn, turn.t("bot.photoFailed"));
  await db
    .from("wa_messages")
    .update({ media_path: path, linked_entity_type: "document", linked_entity_id: doc.id, state: "confirmed" })
    .eq("id", turn.rowId);
  await runExtraction(db as unknown as Db, doc.id).catch(() => "failed");
  return reply(turn, turn.t("bot.photoQueued"));
}

// ----- Safety overrides from WhatsApp (M6) -------------------------------------------------------

async function decideOverride(turn: Turn, requestId: string, decision: "approved" | "declined") {
  const { db, sender } = turn;
  const { data: req } = await db
    .from("safety_override_requests")
    .select("id, org_id, trip_id, safety_check_id, requested_by, requested_at")
    .eq("id", requestId)
    .maybeSingle();
  const managersToo = !!(sender.org.settings as { manager_can_override?: boolean } | null)?.manager_can_override;
  const allowed =
    req?.org_id === sender.orgId && (sender.role === "owner" || (managersToo && sender.role === "manager"));
  if (!req || !allowed) return reply(turn, turn.t("bot.override.notAllowed"));
  const { error } = await db.from("safety_overrides").insert({
    org_id: req.org_id,
    trip_id: req.trip_id,
    safety_check_id: req.safety_check_id,
    request_id: req.id,
    requested_by: req.requested_by,
    requested_at: req.requested_at,
    decided_by: sender.userId,
    decision,
    reason: turn.t("bot.override.reason"),
  });
  if (error) return reply(turn, turn.t(error.code === "23505" ? "bot.override.already" : "bot.override.notAllowed"));
  return reply(turn, turn.t(`bot.override.${decision}`));
}
