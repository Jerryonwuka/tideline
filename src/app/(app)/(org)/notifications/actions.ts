"use server";

import { revalidatePath } from "next/cache";
import { requireMe } from "@/server/auth/session";

export async function markAllReadAction(): Promise<void> {
  const { db, me } = await requireMe("/notifications");
  await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", me.userId)
    .is("read_at", null);
  revalidatePath("/", "layout");
}
