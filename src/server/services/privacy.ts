import "server-only";
import { DEFAULT_RETENTION_MONTHS, MIN_RETENTION_MONTHS, PRIVACY_NOTICE_VERSION } from "@/config/privacy";
import type { Json } from "@/lib/database.types";
import { reportError } from "@/server/log";
import { hashPhone } from "@/server/privacy";
import { enforceLimit } from "@/server/rate-limit";
import type { Me } from "@/server/services/profile";
import { supabaseAdmin } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

// §12 rights and retention. People ask for an export or deletion from Settings → Privacy; platform
// admins work the queue (due in 30 days). Exports are a JSON file in a private bucket with short-lived
// links. Deletion blanks the person's details wherever they appear as passenger or buyer, clears
// references, removes consents, then deletes the account; money and safety records stay without them.

export const PRIVACY_BUCKET = "privacy";
const LINK_SECONDS = 300;

type Purpose = "privacy_notice" | "marketing" | "optional_fields";

/** Records a consent choice (append-only; the newest row per purpose wins). */
export async function recordConsent(
  who: { userId?: string; phoneE164?: string },
  purpose: Purpose,
  granted: boolean,
  source: string,
) {
  const { error } = await supabaseAdmin()
    .from("consents")
    .insert({
      user_id: who.userId ?? null,
      phone_hash: who.userId ? null : who.phoneE164 ? hashPhone(who.phoneE164) : null,
      purpose,
      granted,
      notice_version: PRIVACY_NOTICE_VERSION,
      source,
    });
  if (error) throw fromDbError(error);
}

export async function myConsents(db: Db, userId: string) {
  const { data } = await db
    .from("consents")
    .select("purpose, granted, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const latest: Partial<Record<Purpose, boolean>> = {};
  for (const c of data ?? []) if (!(c.purpose in latest)) latest[c.purpose] = c.granted;
  return latest;
}

export async function requestData(db: Db, me: Me, kind: "export" | "delete") {
  await enforceLimit("dataRequestPerUser", me.userId);
  const { data, error } = await db.from("data_requests").insert({ user_id: me.userId, kind }).select("id").single();
  if (error) throw error.code === "23505" ? new ServiceError("request_already_open") : fromDbError(error);
  return data.id;
}

export async function myRequests(db: Db, userId: string) {
  const { data, error } = await db
    .from("data_requests")
    .select("id, kind, status, due_at, export_path, note, created_at, handled_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  return data;
}

/** The person's own export link (only theirs, only when ready). */
export async function exportLink(db: Db, requestId: string) {
  const { data } = await db.from("data_requests").select("export_path").eq("id", requestId).maybeSingle();
  if (!data?.export_path) throw new ServiceError("not_found");
  const { data: link } = await supabaseAdmin()
    .storage.from(PRIVACY_BUCKET)
    .createSignedUrl(data.export_path, LINK_SECONDS);
  if (!link) throw new ServiceError("not_found");
  return link.signedUrl;
}

// ----- Admin queue ------------------------------------------------------------------------------------

export async function adminRequests(db: Db) {
  const { data, error } = await db
    .from("data_requests")
    .select("id, user_id, kind, status, due_at, note, created_at, handled_at")
    .order("status", { ascending: true })
    .order("due_at", { ascending: true })
    .limit(200);
  if (error) throw fromDbError(error);
  return data;
}

async function pendingRequest(db: Db, id: string, kind: "export" | "delete") {
  // Read through the admin's own session: RLS lets only platform admins see others' requests.
  const { data } = await db.from("data_requests").select("id, user_id, kind, status").eq("id", id).maybeSingle();
  if (!data || data.kind !== kind) throw new ServiceError("not_found");
  if (data.status !== "pending" || !data.user_id) throw new ServiceError("request_closed");
  return data as { id: string; user_id: string };
}

async function close(
  id: string,
  admin: Me,
  fields: { status: "completed" | "rejected"; note?: string; export_path?: string },
) {
  const { error } = await supabaseAdmin()
    .from("data_requests")
    .update({ ...fields, handled_by: admin.userId, handled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw fromDbError(error);
}

/** Everything we hold about the person, as JSON. */
export async function buildExport(userId: string) {
  const a = supabaseAdmin();
  const { data: profile } = await a
    .from("profiles")
    .select("full_name, phone_e164, email, locale, time_zone, whatsapp_opt_in, created_at")
    .eq("id", userId)
    .single();
  const phone = profile?.phone_e164 ?? null;
  const [memberships, consents, notifications, tickets, manifests, crew, requests] = await Promise.all([
    a.from("memberships").select("role, status, created_at, org:orgs(name)").eq("user_id", userId),
    a.from("consents").select("purpose, granted, notice_version, source, created_at").eq("user_id", userId),
    a.from("notifications").select("channel, template, payload, sent_at, read_at").eq("user_id", userId).limit(1000),
    a
      .from("tickets")
      .select("code, qty, total_minor, currency, status, created_at, buyer_name")
      .or(phone ? `passenger_user_id.eq.${userId},buyer_phone.eq.${phone}` : `passenger_user_id.eq.${userId}`),
    phone
      ? a.from("manifest_entries").select("full_name, seats, boarded_at, created_at, trip_id").eq("phone_e164", phone)
      : Promise.resolve({ data: [] }),
    a.from("crew_members").select("full_name, crew_role, status, created_at, org:orgs(name)").eq("user_id", userId),
    a.from("data_requests").select("kind, status, created_at, handled_at").eq("user_id", userId),
  ]);
  return {
    generated_at: new Date().toISOString(),
    profile,
    memberships: memberships.data ?? [],
    consents: consents.data ?? [],
    notifications: notifications.data ?? [],
    tickets: tickets.data ?? [],
    passenger_manifest_entries: manifests.data ?? [],
    crew_records: crew.data ?? [],
    data_requests: requests.data ?? [],
  };
}

export async function completeExport(db: Db, admin: Me, requestId: string) {
  const r = await pendingRequest(db, requestId, "export");
  const body = JSON.stringify(await buildExport(r.user_id), null, 2);
  const path = `${r.user_id}/export-${r.id}.json`;
  const up = await supabaseAdmin()
    .storage.from(PRIVACY_BUCKET)
    .upload(path, new TextEncoder().encode(body), { contentType: "application/json", upsert: true });
  if (up.error) throw new Error(`export upload: ${up.error.message}`);
  await close(r.id, admin, { status: "completed", export_path: path });
}

/** Sole owners must hand over their companies first; otherwise the account is erased. */
export async function completeDeletion(db: Db, admin: Me, requestId: string) {
  const r = await pendingRequest(db, requestId, "delete");
  const a = supabaseAdmin();
  const { data: owned } = await a
    .from("memberships")
    .select("org_id, org:orgs(name)")
    .eq("user_id", r.user_id)
    .eq("role", "owner")
    .eq("status", "active");
  for (const m of owned ?? []) {
    const { count } = await a
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", m.org_id)
      .eq("role", "owner")
      .eq("status", "active")
      .neq("user_id", r.user_id);
    if (!count) {
      await close(r.id, admin, { status: "rejected", note: "sole_owner" });
      throw new ServiceError("sole_owner");
    }
  }
  const { data: profile } = await a.from("profiles").select("phone_e164").eq("id", r.user_id).single();
  const phone = profile?.phone_e164 ?? null;
  const { error } = await a.rpc("erase_person", {
    p_user: r.user_id,
    p_phone: phone ?? "",
    p_phone_hash: phone ? hashPhone(phone) : "",
  });
  if (error) throw fromDbError(error);
  // Exports already made for them go too.
  const { data: files } = await a.storage.from(PRIVACY_BUCKET).list(r.user_id);
  if (files?.length) await a.storage.from(PRIVACY_BUCKET).remove(files.map((f) => `${r.user_id}/${f.name}`));
  await close(r.id, admin, { status: "completed" });
  const del = await a.auth.admin.deleteUser(r.user_id);
  if (del.error) throw new Error(`delete user: ${del.error.message}`);
}

export async function rejectRequest(db: Db, admin: Me, requestId: string, note: string) {
  const { data } = await db.from("data_requests").select("id, status").eq("id", requestId).maybeSingle();
  if (!data) throw new ServiceError("not_found");
  if (data.status !== "pending") throw new ServiceError("request_closed");
  await close(requestId, admin, { status: "rejected", note });
}

// ----- Retention job ----------------------------------------------------------------------------------

/** Daily: anonymise manifests/tickets and delete GPS tracks older than each org's retention period. */
export async function runRetention(now = new Date()) {
  const a = supabaseAdmin();
  const { data: orgs } = await a.from("orgs").select("id, settings");
  const totals = { orgs: 0, manifest_entries: 0, tickets: 0, positions: 0, overdue_requests: 0 };
  for (const org of orgs ?? []) {
    const months = Math.max(
      MIN_RETENTION_MONTHS,
      Number((org.settings as { retention_months?: number } | null)?.retention_months) || DEFAULT_RETENTION_MONTHS,
    );
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    const { data, error } = await a.rpc("anonymise_trips_before", { p_org: org.id, p_before: cutoff.toISOString() });
    if (error) {
      await reportError("job.retention", error, { org: org.id });
      continue;
    }
    const r = data as { manifest_entries: number; tickets: number; positions: number };
    totals.orgs++;
    totals.manifest_entries += r.manifest_entries;
    totals.tickets += r.tickets;
    totals.positions += r.positions;
  }
  const { count } = await a
    .from("data_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("due_at", now.toISOString());
  totals.overdue_requests = count ?? 0;
  if (totals.overdue_requests) {
    await reportError("privacy.requests_overdue", new Error(`${totals.overdue_requests} data requests past due`));
  }
  return totals as Record<string, number> & Json;
}
