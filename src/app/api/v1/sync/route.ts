import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { syncBatchSchema } from "@/lib/schemas/sync";
import { parseJson, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import { applySyncBatch, captainSnapshot } from "@/server/services/sync";
import { supabaseForRequest } from "@/server/supabase/server";

async function caller(request: Request) {
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  return { db, me };
}

/** What a captain's phone caches for offline use: today's trips, manifests, vessels and routes. */
export const GET = route(async (request) => {
  const { org_id } = z.object({ org_id: uuid }).parse(Object.fromEntries(new URL(request.url).searchParams));
  const { db, me } = await caller(request);
  const membership = me.memberships.find((m) => m.orgId === org_id && m.status === "active");
  if (!membership) throw new ServiceError("forbidden");
  return NextResponse.json(await captainSnapshot(db, me, membership), { headers: { "cache-control": "no-store" } });
});

/** A batch of queued offline ops, applied in order and idempotently by (org_id, client_id). */
export const POST = route(async (request) => {
  const { db, me } = await caller(request);
  const batch = await parseJson(request, syncBatchSchema);
  return NextResponse.json({ results: await applySyncBatch(db, me, batch.org_id, batch.ops) });
});
