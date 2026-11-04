import "server-only";
import { notFound } from "next/navigation";
import { requireMe } from "@/server/auth/session";

/** Pages under /admin re-check the role themselves (the layout check isn't a security boundary). */
export async function requireAdmin(path: string) {
  const ctx = await requireMe(path);
  if (!ctx.me.isPlatformAdmin) notFound();
  return ctx;
}
