import "server-only";
import { createTranslator } from "next-intl";
import { daysUntil, localHour } from "@/lib/dates";
import { defaultLocale, isLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import type { MessagingClient } from "@/server/integrations/messaging/types";
import type { AdminDb } from "@/server/supabase/admin";

/** Days before expiry when owners and managers are told (and on the day itself), §4.1. */
export const DEFAULT_ALERT_OFFSETS = [90, 60, 30, 14, 7, 1, 0];
/** Alerts go out at 07:00 in each org's own time zone. */
export const ALERT_LOCAL_HOUR = 7;

/** Pure: whether today is an alert day for a document, and which offset it is. */
export function dueOffset(daysToExpiry: number, offsets: number[]): number | null {
  return offsets.includes(daysToExpiry) ? daysToExpiry : null;
}

export function alertOffsetsFor(settings: unknown): number[] {
  const raw = (settings as { alert_offsets?: unknown } | null)?.alert_offsets;
  return Array.isArray(raw) && raw.every((n) => Number.isInteger(n) && n >= 0 && n <= 365)
    ? (raw as number[])
    : DEFAULT_ALERT_OFFSETS;
}

export interface AlertRunSummary {
  orgsChecked: number;
  orgsAtAlertHour: number;
  alertsClaimed: number;
  messagesSent: number;
  smsFallbacks: number;
}

interface Deps {
  db: AdminDb;
  messaging: MessagingClient;
  appUrl: string;
  now: Date;
}

/**
 * The hourly `alerts-expiry` job. Each (document, offset, channel) is claimed by inserting into
 * document_alerts first (unique), and only the run that wins the claim sends, so re-running the
 * job — or two runs overlapping — never sends an alert twice.
 */
export async function runExpiryAlerts(
  deps: Deps,
  opts: { orgIds?: string[]; ignoreHour?: boolean } = {},
): Promise<AlertRunSummary> {
  const summary: AlertRunSummary = {
    orgsChecked: 0,
    orgsAtAlertHour: 0,
    alertsClaimed: 0,
    messagesSent: 0,
    smsFallbacks: 0,
  };
  let q = deps.db.from("orgs").select("id, name, time_zone, default_locale, settings");
  if (opts.orgIds) q = q.in("id", opts.orgIds);
  const { data: orgs, error } = await q;
  if (error) throw new Error(`alerts-expiry: ${error.message}`);

  for (const org of orgs) {
    summary.orgsChecked += 1;
    if (!opts.ignoreHour && localHour(deps.now, org.time_zone) !== ALERT_LOCAL_HOUR) continue;
    summary.orgsAtAlertHour += 1;
    const offsets = alertOffsetsFor(org.settings);

    const { data: docs } = await deps.db
      .from("documents")
      .select("id, subject_type, subject_id, document_type_code, expiry_date, status")
      .eq("org_id", org.id)
      .is("replaced_by", null)
      .not("expiry_date", "is", null)
      .not("status", "in", "(needs_review,rejected)");
    const due = (docs ?? [])
      .map((d) => ({ ...d, offset: dueOffset(daysUntil(d.expiry_date!, deps.now, org.time_zone), offsets) }))
      .filter((d): d is typeof d & { offset: number } => d.offset !== null);
    if (!due.length) continue;

    const { data: recipients } = await deps.db
      .from("memberships")
      .select("user_id, profile:profiles!memberships_user_id_profiles_id_fk(phone_e164, locale)")
      .eq("org_id", org.id)
      .eq("status", "active")
      .in("role", ["owner", "manager"]);
    const names = await subjectNames(deps.db, org.id, due);
    const locale = isLocale(org.default_locale) ? org.default_locale : defaultLocale;
    // Messages are loaded at runtime, so keys aren't type-checked here.
    const messages = await loadMessages(locale);
    const t = createTranslator({ locale, messages }) as unknown as (
      key: string,
      values?: Record<string, string | number>,
    ) => string;
    const tDocs = (code: string) => t(`documentTypes.${code}`);

    for (const doc of due) {
      const docName = tDocs(doc.document_type_code);
      const subject = names.get(doc.subject_id) ?? org.name;
      const link = `${deps.appUrl.replace(/\/$/, "")}/documents/${doc.id}`;
      const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(`${doc.expiry_date}T00:00:00Z`),
      );
      const payload = { documentId: doc.id, document: docName, subject, date, days: doc.offset };

      // In-app: one notification per owner/manager.
      if (await claim(deps.db, org.id, doc.id, doc.offset, "in_app")) {
        summary.alertsClaimed += 1;
        await deps.db.from("notifications").insert(
          (recipients ?? []).map((r) => ({
            org_id: org.id,
            user_id: r.user_id,
            template: "document_expiry",
            payload,
          })),
        );
        await markSent(deps.db, doc.id, doc.offset, "in_app", { recipients: recipients?.length ?? 0 });
      }

      // WhatsApp with SMS fallback.
      if (await claim(deps.db, org.id, doc.id, doc.offset, "whatsapp")) {
        summary.alertsClaimed += 1;
        let sent = 0;
        let fallbacks = 0;
        for (const r of recipients ?? []) {
          const phone = r.profile?.phone_e164;
          if (!phone) continue;
          const wa = await deps.messaging
            .send({
              channel: "whatsapp",
              kind: "template",
              toE164: phone,
              template: "document_expiry",
              locale,
              params: [docName, subject, date, String(doc.offset), link],
            })
            .catch(() => null);
          if (wa?.status === "accepted") {
            sent += 1;
            continue;
          }
          const text =
            doc.offset === 0
              ? t("alerts.sms.today", { document: docName, subject, link })
              : t("alerts.sms.soon", { document: docName, subject, date, days: doc.offset, link });
          const sms = await deps.messaging
            .send({ channel: "sms", kind: "text", toE164: phone, text })
            .catch(() => null);
          if (sms?.status === "accepted") {
            sent += 1;
            fallbacks += 1;
          }
        }
        summary.messagesSent += sent;
        summary.smsFallbacks += fallbacks;
        await markSent(
          deps.db,
          doc.id,
          doc.offset,
          "whatsapp",
          { sent, sms_fallback: fallbacks },
          sent > 0 ? "sent" : "failed",
        );
      }
    }
  }
  return summary;
}

async function claim(
  db: AdminDb,
  orgId: string,
  documentId: string,
  offset: number,
  channel: "in_app" | "whatsapp",
): Promise<boolean> {
  const { data } = await db
    .from("document_alerts")
    .upsert(
      { org_id: orgId, document_id: documentId, offset_days: offset, channel, status: "claimed" },
      {
        onConflict: "document_id,offset_days,channel",
        ignoreDuplicates: true,
      },
    )
    .select("id");
  return (data?.length ?? 0) > 0;
}

async function markSent(
  db: AdminDb,
  documentId: string,
  offset: number,
  channel: "in_app" | "whatsapp",
  detail: Record<string, number>,
  status = "sent",
) {
  await db
    .from("document_alerts")
    .update({ status, sent_at: new Date().toISOString(), detail })
    .eq("document_id", documentId)
    .eq("offset_days", offset)
    .eq("channel", channel);
}

async function subjectNames(db: AdminDb, orgId: string, docs: { subject_type: string; subject_id: string }[]) {
  const vesselIds = docs.filter((d) => d.subject_type === "vessel").map((d) => d.subject_id);
  const crewIds = docs.filter((d) => d.subject_type === "crew").map((d) => d.subject_id);
  const [vessels, crew] = await Promise.all([
    vesselIds.length
      ? db.from("vessels").select("id, name").in("id", vesselIds).eq("org_id", orgId)
      : Promise.resolve({ data: [] }),
    crewIds.length
      ? db.from("crew_members").select("id, full_name").in("id", crewIds).eq("org_id", orgId)
      : Promise.resolve({ data: [] }),
  ]);
  return new Map<string, string>([
    ...((vessels.data ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name] as const),
    ...((crew.data ?? []) as { id: string; full_name: string }[]).map((c) => [c.id, c.full_name] as const),
  ]);
}
