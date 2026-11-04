import "server-only";
import { createHash } from "node:crypto";
import { renderTemplate } from "@/lib/contracts";
import { hireDays } from "@/lib/invoices";
import { fromMajor, money } from "@/lib/money";
import { pdfMoney, renderPdf, type PdfBlock } from "@/server/pdf";
import { supabaseAdmin } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { fromDbError, ServiceError } from "./errors";

// §4.3 contracts: generated from a template with the charter's terms; both parties accept in the
// app (name, time, IP and user agent recorded by accept_contract); the PDF is stored privately and
// re-rendered with the acceptance record once both have accepted.

export const BUSINESS_BUCKET = "business";
const SIGNED_URL_SECONDS = 300;

export async function listTemplates(db: Db) {
  const { data, error } = await db.from("contract_templates").select("id, name, org_id, locale").order("name");
  if (error) throw fromDbError(error);
  return data;
}

/** Everything a template can use, from the charter, its quote and both parties. */
async function charterVariables(charterId: string, locale: string) {
  const db = supabaseAdmin();
  const { data: c, error } = await db
    .from("charters")
    .select(
      "*, vessel:vessels(name, type), quote:charter_quotes(terms, request:charter_requests(location)), owner:orgs!charters_owner_org_id_orgs_id_fk(name), charterer:orgs!charters_charterer_org_id_orgs_id_fk(name), country:countries!charters_governing_country_code_countries_code_fk(name)",
    )
    .eq("id", charterId)
    .single();
  if (error) throw fromDbError(error);
  const terms = (c.quote?.terms ?? {}) as { fuel?: string | null; payment?: string | null };
  const m = (minor: number | string) => pdfMoney(money(BigInt(minor), c.currency), locale);
  return {
    charter: c,
    vars: {
      owner_name: c.owner?.name,
      charterer_name: c.charterer?.name ?? c.client_name,
      vessel_name: c.vessel?.name,
      vessel_type: c.vessel?.type?.replace(/_/g, " "),
      start_date: c.start_date,
      end_date: c.end_date,
      days: hireDays(c),
      location: c.quote?.request?.location,
      day_rate: m(c.day_rate_minor),
      mobilisation: m(c.mobilisation_minor),
      total_value: m(c.total_value_minor),
      fuel_terms: terms.fuel,
      payment_terms: terms.payment,
      governing_country: c.country?.name ?? c.governing_country_code,
    },
  };
}

async function storePdf(contractId: string, ownerOrgId: string, body: string, acceptance: Record<string, unknown>) {
  const blocks: PdfBlock[] = body
    .split("\n\n")
    .map((p, i) => ({ text: p, size: i === 0 ? 14 : 10, bold: i === 0, gapBefore: i ? 6 : 0 }));
  for (const side of ["owner", "charterer"] as const) {
    const a = acceptance[side] as { name?: string; ip?: string; at?: string } | undefined;
    blocks.push({
      text: a
        ? `Accepted by ${side}: ${a.name} on ${a.at} from ${a.ip ?? "unknown IP"}`
        : `Not yet accepted by the ${side}.`,
      size: 9,
      gapBefore: side === "owner" ? 18 : 2,
    });
  }
  const pdf = await renderPdf("Charter agreement", blocks, `Tideline contract ${contractId}`);
  const path = `${ownerOrgId}/contracts/${contractId}.pdf`;
  const { error } = await supabaseAdmin()
    .storage.from(BUSINESS_BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`contract pdf: ${error.message}`);
  await supabaseAdmin().from("contracts").update({ pdf_path: path }).eq("id", contractId);
  return path;
}

/** The owner generates (or, before anyone accepts, regenerates) the contract for a charter. */
export async function generateContract(db: Db, charterId: string, templateId?: string, locale = "en") {
  const { data: visible } = await db
    .from("charters")
    .select("id, owner_org_id, charterer_org_id")
    .eq("id", charterId)
    .maybeSingle();
  if (!visible) throw new ServiceError("not_found");
  const templates = await listTemplates(db);
  const template =
    templates.find((t) => t.id === templateId) ??
    templates.find((t) => t.org_id === visible.owner_org_id) ??
    templates[0];
  if (!template) throw new ServiceError("not_found");
  const { data: tpl } = await db.from("contract_templates").select("body_template").eq("id", template.id).single();
  const { vars } = await charterVariables(charterId, locale);
  const body = renderTemplate(tpl!.body_template, vars);
  const hash = createHash("sha256").update(body).digest("hex");
  const { data: existing } = await db.from("contracts").select("id").eq("charter_id", charterId).maybeSingle();
  const row = {
    owner_org_id: visible.owner_org_id,
    charterer_org_id: visible.charterer_org_id,
    charter_id: charterId,
    template_id: template.id,
    body_html: body,
    body_hash: hash,
  };
  const { data, error } = existing
    ? await db.from("contracts").update(row).eq("id", existing.id).select("id").single()
    : await db.from("contracts").insert(row).select("id").single();
  if (error) throw fromDbError(error);
  await storePdf(data.id, visible.owner_org_id, body, {});
  return data.id;
}

/** One side accepts; the PDF is re-rendered with the acceptance record. */
export async function acceptContract(
  db: Db,
  contractId: string,
  name: string,
  ip: string | null,
  userAgent: string | null,
) {
  const { data: side, error } = await db.rpc("accept_contract", {
    p_contract: contractId,
    p_name: name,
    p_ip: ip ?? "",
    p_user_agent: userAgent ?? "",
  });
  if (error) throw fromDbError(error);
  const { data: k } = await supabaseAdmin()
    .from("contracts")
    .select("owner_org_id, body_html, acceptance_meta, owner_accepted_at, charterer_accepted_at")
    .eq("id", contractId)
    .single();
  if (k) {
    const meta = k.acceptance_meta as Record<string, Record<string, unknown>>;
    await storePdf(contractId, k.owner_org_id, k.body_html, {
      ...(meta.owner ? { owner: { ...meta.owner, at: k.owner_accepted_at } } : {}),
      ...(meta.charterer ? { charterer: { ...meta.charterer, at: k.charterer_accepted_at } } : {}),
    });
  }
  return side;
}

export async function getContractForCharter(db: Db, charterId: string) {
  const { data, error } = await db.from("contracts").select("*").eq("charter_id", charterId).maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}

/** A 5-minute link to a stored PDF, for someone who can see the record (checked by the caller). */
export async function signedPdfUrl(path: string | null) {
  if (!path) return null;
  const { data } = await supabaseAdmin().storage.from(BUSINESS_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

/** Charters the org owns or chartered, with the other side's name and the vessel's. */
export async function listCharters(db: Db, orgId: string) {
  const { data, error } = await db
    .from("charters")
    .select(
      "id, owner_org_id, charterer_org_id, client_name, vessel_id, start_date, end_date, currency, total_value_minor, status, booked_on_platform, commission_bps",
    )
    .or(`owner_org_id.eq.${orgId},charterer_org_id.eq.${orgId}`)
    .order("start_date", { ascending: false });
  if (error) throw fromDbError(error);
  const admin = supabaseAdmin();
  const orgIds = [
    ...new Set(data.flatMap((c) => [c.owner_org_id, c.charterer_org_id]).filter((x): x is string => !!x)),
  ];
  const vesselIds = [...new Set(data.map((c) => c.vessel_id))];
  const [{ data: orgs }, { data: vessels }] = await Promise.all([
    orgIds.length
      ? admin.from("orgs").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    vesselIds.length
      ? admin.from("vessels").select("id, name").in("id", vesselIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const vesselName = new Map((vessels ?? []).map((v) => [v.id, v.name]));
  return data.map((c) => ({
    ...c,
    side: c.owner_org_id === orgId ? ("owner" as const) : ("charterer" as const),
    ownerName: orgName.get(c.owner_org_id) ?? "",
    chartererName: c.charterer_org_id ? (orgName.get(c.charterer_org_id) ?? "") : (c.client_name ?? ""),
    vesselName: vesselName.get(c.vessel_id) ?? "",
  }));
}

/** Owner records a charter agreed outside Tideline, for invoicing only (no commission). */
export async function recordOffPlatformCharter(
  db: Db,
  orgId: string,
  currency: string,
  input: {
    vesselId: string;
    clientName: string;
    startDate: string;
    endDate: string;
    dayRate: string;
    mobilisation?: string;
  },
) {
  const rate = fromMajorSafe(input.dayRate, currency);
  const mob = fromMajorSafe(input.mobilisation ?? "0", currency);
  const days = hireDays({ start_date: input.startDate, end_date: input.endDate });
  const { data, error } = await db
    .from("charters")
    .insert({
      owner_org_id: orgId,
      vessel_id: input.vesselId,
      client_name: input.clientName,
      start_date: input.startDate,
      end_date: input.endDate,
      currency,
      day_rate_minor: String(rate),
      mobilisation_minor: String(mob),
      total_value_minor: String(rate * BigInt(days) + mob),
      booked_on_platform: false,
    } as never)
    .select("id")
    .single();
  if (error) throw error.message === "invalid_subject" ? new ServiceError("validation") : fromDbError(error);
  return data.id;
}

const fromMajorSafe = (v: string, currency: string) => fromMajor(v, currency).amountMinor;
