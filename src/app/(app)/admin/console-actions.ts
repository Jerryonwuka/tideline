"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { countryCodeSchema, uuid } from "@/lib/schemas/common";
import { requireMe } from "@/server/auth/session";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { completeDeletion, completeExport, rejectRequest } from "@/server/services/privacy";

// Platform-admin console writes. Each runs through the admin's own session, so RLS
// (is_platform_admin) is the gate and audit rows carry the admin as the actor.

export type ConsoleState = {
  error?: ErrorCode;
  ok?: boolean;
  tripId?: string;
  rows?: {
    id: string;
    full_name: string | null;
    phone_e164: string | null;
    seats: number;
    boarded_at: string | null;
  }[];
};
const code = (err: unknown): ErrorCode =>
  err instanceof ServiceError
    ? err.code
    : err && typeof err === "object" && "message" in err && String(err.message).includes("reason_required")
      ? "reason_required"
      : "unknown";

async function admin() {
  const ctx = await requireMe("/admin");
  if (!ctx.me.isPlatformAdmin) throw new ServiceError("forbidden");
  return ctx;
}

async function run(
  path: string,
  fn: (ctx: Awaited<ReturnType<typeof admin>>) => Promise<unknown>,
): Promise<ConsoleState> {
  try {
    await fn(await admin());
  } catch (err) {
    return { error: code(err) };
  }
  revalidatePath(path);
  return { ok: true };
}

const check = <T>(r: { error: T | null }) => {
  if (r.error) throw r.error;
};

export async function verifyOrgAction(_: ConsoleState, f: FormData) {
  const id = uuid.parse(f.get("id"));
  const status = z.enum(["unverified", "pending", "verified"]).parse(f.get("status"));
  return run("/admin/orgs", async ({ db }) =>
    check(await db.from("orgs").update({ verification_status: status }).eq("id", id)),
  );
}

export async function flagAction(_: ConsoleState, f: FormData) {
  const key = z.enum(["charter", "escrow", "phase3"]).parse(f.get("key"));
  return run("/admin/flags", async ({ db }) =>
    check(
      await db
        .from("feature_flags")
        .update({ enabled: f.get("enabled") === "on" })
        .eq("key", key),
    ),
  );
}

export async function feeAction(_: ConsoleState, f: FormData) {
  const parsed = z
    .object({
      key: z.enum(["ticket_fee_bps", "charter_commission_bps", "charter_inapp_discount_bps"]),
      country: z.union([countryCodeSchema, z.literal("")]),
      value: z.coerce.number().int().min(0).max(2000),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse(Object.fromEntries(f));
  if (!parsed.success) return { error: "validation" as const };
  const v = parsed.data;
  // A new row per change keeps the history; the newest effective row applies.
  return run("/admin/fees", async ({ db }) =>
    check(
      await db
        .from("fee_config")
        .insert({ key: v.key, country_code: v.country || null, value: v.value, effective_from: v.effectiveFrom }),
    ),
  );
}

export async function jettyAction(_: ConsoleState, f: FormData) {
  const id = uuid.parse(f.get("id"));
  return run("/admin/jetties", async ({ db }) =>
    check(await db.from("jetties").update({ status: "active" }).eq("id", id)),
  );
}

export async function privacyAction(_: ConsoleState, f: FormData) {
  const id = uuid.parse(f.get("id"));
  const op = z.enum(["export", "delete", "reject"]).parse(f.get("op"));
  return run("/admin/privacy", async ({ db, me }) => {
    if (op === "export") await completeExport(db, me, id);
    else if (op === "delete") await completeDeletion(db, me, id);
    else await rejectRequest(db, me, id, String(f.get("note") ?? "").slice(0, 300) || "rejected");
  });
}

/** Passenger data needs a reason; the database function checks it and logs the read. */
export async function readManifestAction(_: ConsoleState, f: FormData): Promise<ConsoleState> {
  const tripId = String(f.get("tripId") ?? "").trim();
  const trip = uuid.safeParse(tripId);
  if (!trip.success) return { error: "validation", tripId };
  try {
    const { db } = await admin();
    const { data, error } = await db.rpc("admin_read_manifest", {
      p_trip: trip.data,
      p_reason: String(f.get("reason") ?? ""),
    });
    if (error) throw error;
    revalidatePath("/admin/passengers");
    return { ok: true, tripId, rows: data ?? [] };
  } catch (err) {
    return { error: code(err), tripId };
  }
}
