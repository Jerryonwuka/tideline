import "server-only";
import { z } from "zod";
import { addDays, localDate } from "@/lib/dates";
import { formatMoney, money } from "@/lib/money";
import type { AdminDb } from "@/server/supabase/admin";
import type { Db } from "@/server/supabase/server";
import { idleVessels } from "@/server/services/dashboard";
import { dailyReport, tripLabel } from "@/server/services/ferry";

// §10.6 assistant tools: read tools and draft tools only. None can move money, delete data,
// change roles or approve safety overrides, so the assistant can't do those whatever it is asked.
// Every query is scoped to the asker's org (and runs under their RLS in the app).

export interface ToolContext {
  db: Db | AdminDb;
  orgId: string;
  timeZone: string;
  currency: string;
  locale: string;
  now: Date;
}

export interface AssistantTool<I extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  kind: "read" | "draft";
  inputSchema: I;
  run(ctx: ToolContext, input: z.infer<I>): Promise<unknown>;
}

const tool = <I extends z.ZodType>(t: AssistantTool<I>) => t;
const show = (ctx: ToolContext, minor: number | string | bigint, currency = ctx.currency) =>
  formatMoney(money(BigInt(minor), currency), ctx.locale);
const day = (ctx: ToolContext, iso: string) =>
  new Intl.DateTimeFormat(ctx.locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export const TOOLS = [
  tool({
    name: "list_expiring_documents",
    kind: "read",
    description:
      "Certificates and documents that have expired or expire by a date (default: within 30 days). For 'this month' pass until = the last day of the month.",
    inputSchema: z.object({
      until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      days: z.number().int().min(1).max(365).optional(),
    }),
    async run(ctx, input) {
      const today = localDate(ctx.now, ctx.timeZone);
      const until = input.until ?? addDays(today, input.days ?? 30);
      const { data, error } = await ctx.db
        .from("documents_live")
        .select("id, document_type_code, subject_type, subject_id, expiry_date, effective_status")
        .eq("org_id", ctx.orgId)
        .not("expiry_date", "is", null)
        .lte("expiry_date", until)
        .order("expiry_date");
      if (error) throw new Error(error.code);
      const names = await subjectNames(ctx, data);
      return {
        today,
        until,
        documents: data.map((d) => ({
          id: d.id,
          type: d.document_type_code,
          for: names.get(d.subject_id ?? "") ?? d.subject_type,
          expires: d.expiry_date,
          expires_display: d.expiry_date ? day(ctx, d.expiry_date) : null,
          status: d.effective_status,
        })),
      };
    },
  }),
  tool({
    name: "get_vessel_status",
    kind: "read",
    description: "Each vessel's status, capacity and its trip today (or one vessel by name).",
    inputSchema: z.object({ vessel_name: z.string().optional() }),
    async run(ctx, input) {
      let q = ctx.db
        .from("vessels")
        .select("id, name, status, passenger_capacity")
        .eq("org_id", ctx.orgId)
        .order("name");
      if (input.vessel_name) q = q.ilike("name", `%${input.vessel_name}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.code);
      const report = await dailyReport(
        ctx.db as Db,
        ctx.orgId,
        localDate(ctx.now, ctx.timeZone),
        ctx.timeZone,
        ctx.currency,
      );
      return data.map((v) => {
        const trips = report.trips.filter((t) => t.vessel_id === v.id);
        return {
          name: v.name,
          status: v.status,
          capacity: v.passenger_capacity,
          trips_today: trips.map((t) => ({
            id: t.id,
            route: tripLabel(t),
            status: t.status,
            passengers: t.passenger_count,
          })),
        };
      });
    },
  }),
  tool({
    name: "get_daily_report",
    kind: "read",
    description: "Trips, passengers and takings (cash and digital) per vessel for a day (default today).",
    inputSchema: z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
    async run(ctx, input) {
      const date = input.date ?? localDate(ctx.now, ctx.timeZone);
      const r = await dailyReport(ctx.db as Db, ctx.orgId, date, ctx.timeZone, ctx.currency);
      return {
        date,
        totals: {
          trips: r.totals.trips,
          passengers: r.totals.passengers,
          cash: show(ctx, r.totals.cash.amountMinor),
          digital: show(ctx, r.totals.digital.amountMinor),
        },
        vessels: r.rows.map((row) => ({
          name: row.vesselName,
          trips: row.trips,
          passengers: row.passengers,
          cash: show(ctx, row.cash.amountMinor),
          digital: show(ctx, row.digital.amountMinor),
        })),
      };
    },
  }),
  tool({
    name: "get_trip",
    kind: "read",
    description: "One trip by id: route, vessel, status, times, passengers and takings.",
    inputSchema: z.object({ trip_id: z.string().uuid() }),
    async run(ctx, input) {
      const { data } = await ctx.db
        .from("trips")
        .select(
          "id, status, scheduled_departure, actual_departure, actual_arrival, passenger_count, takings_cash_minor, takings_digital_minor, currency, origin_text, destination_text, vessel:vessels(name), route:routes(origin:jetties!routes_origin_jetty_id_jetties_id_fk(name), destination:jetties!routes_destination_jetty_id_jetties_id_fk(name))",
        )
        .eq("org_id", ctx.orgId)
        .eq("id", input.trip_id)
        .maybeSingle();
      if (!data) return { found: false };
      return {
        found: true,
        route: tripLabel(data),
        vessel: data.vessel?.name,
        status: data.status,
        departed: data.actual_departure,
        arrived: data.actual_arrival,
        passengers: data.passenger_count,
        cash: show(ctx, data.takings_cash_minor, data.currency),
        digital: show(ctx, data.takings_digital_minor, data.currency),
      };
    },
  }),
  tool({
    name: "list_idle_vessels",
    kind: "read",
    description: "Vessels with no trips in the last 7 days.",
    inputSchema: z.object({}),
    async run(ctx) {
      return (await idleVessels(ctx.db as Db, ctx.orgId, ctx.now)).map((v) => ({
        name: v.name,
        last_trip: v.lastTripAt,
      }));
    },
  }),
  tool({
    name: "list_open_invoices",
    kind: "read",
    description: "Unpaid invoices.",
    inputSchema: z.object({}),
    async run() {
      return { invoices: [], note: "Invoicing isn't set up yet; it arrives with charter contracts and invoices." };
    },
  }),
  tool({
    name: "draft_trip_log",
    kind: "draft",
    description: "Prepare (not save) a trip log for the person to check and save in captain mode or by WhatsApp.",
    inputSchema: z.object({
      vessel_name: z.string().optional(),
      route: z.string().optional(),
      passengers: z.number().int().min(0).optional(),
      cash: z.number().min(0).optional(),
    }),
    async run(ctx, input) {
      return {
        saved: false,
        draft: input,
        how_to_save: "Open captain mode (/captain) or send it to the WhatsApp bot and press Confirm.",
      };
    },
  }),
  ...(["draft_invoice", "draft_tender_pack", "suggest_price"] as const).map((name) =>
    tool({
      name,
      kind: "draft",
      description:
        name === "suggest_price"
          ? "Suggest a charter day rate for a vessel."
          : name === "draft_invoice"
            ? "Prepare an invoice draft."
            : "Prepare a tender pack draft.",
      inputSchema: z.object({ details: z.string().optional() }),
      async run() {
        return { available: false, note: "This arrives with the charter features; nothing was created." };
      },
    }),
  ),
] as const;

async function subjectNames(ctx: ToolContext, docs: { subject_type: string | null; subject_id: string | null }[]) {
  const ids = (type: string) => [...new Set(docs.filter((d) => d.subject_type === type).map((d) => d.subject_id!))];
  const [vessels, crew] = await Promise.all([
    ids("vessel").length
      ? ctx.db.from("vessels").select("id, name").in("id", ids("vessel"))
      : Promise.resolve({ data: [] }),
    ids("crew").length
      ? ctx.db.from("crew_members").select("id, full_name").in("id", ids("crew"))
      : Promise.resolve({ data: [] }),
  ]);
  const names = new Map<string, string>();
  for (const v of (vessels.data ?? []) as { id: string; name: string }[]) names.set(v.id, v.name);
  for (const c of (crew.data ?? []) as { id: string; full_name: string }[]) names.set(c.id, c.full_name);
  return names;
}

/** The names of tools that could move money, delete data, change roles or override safety: none. */
export const FORBIDDEN_CAPABILITIES = /pay|transfer|refund|payout|delete|remove|role|override|approve/;
