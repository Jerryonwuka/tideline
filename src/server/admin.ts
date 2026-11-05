import "server-only";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import type { Db } from "@/server/supabase/server";

/** API guard for /api/v1/admin/*. RLS enforces the same rule in the database. */
export async function assertPlatformAdmin(db: Db): Promise<void> {
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  if (!me.isPlatformAdmin) throw new ServiceError("forbidden");
}
