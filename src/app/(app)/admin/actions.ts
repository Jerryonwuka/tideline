"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { countryCodeSchema } from "@/lib/schemas/common";
import { launchStatusSchema, publishRuleSetSchema } from "@/lib/schemas/countries";
import { ServiceError, type ErrorCode } from "@/server/services/errors";
import { updateCountry } from "@/server/services/countries";
import { newRuleSetVersion, publishRuleSet } from "@/server/services/rule-sets";
import { supabaseServer } from "@/server/supabase/server";

export type AdminState = { error?: ErrorCode; ok?: boolean };
const code = (err: unknown): ErrorCode => (err instanceof ServiceError ? err.code : "unknown");

export async function updateCountryAction(_: AdminState, formData: FormData): Promise<AdminState> {
  const country = countryCodeSchema.safeParse(formData.get("code"));
  const launch = launchStatusSchema.safeParse(formData.get("launchStatus"));
  if (!country.success || !launch.success) return { error: "validation" };
  try {
    await updateCountry(await supabaseServer(), country.data, {
      enabled: formData.get("enabled") === "on",
      launchStatus: launch.data,
    });
    revalidatePath("/admin/countries");
    return { ok: true };
  } catch (err) {
    return { error: code(err) };
  }
}

export async function publishRuleSetAction(_: AdminState, formData: FormData): Promise<AdminState> {
  const id = z.uuid().safeParse(formData.get("id"));
  const body = publishRuleSetSchema.safeParse({ note: formData.get("note") ?? undefined });
  if (!id.success || !body.success) return { error: "validation" };
  try {
    await publishRuleSet(await supabaseServer(), id.data, body.data.note);
    revalidatePath("/admin/rule-sets");
    return { ok: true };
  } catch (err) {
    return { error: code(err) };
  }
}

export async function newVersionAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const newId = await newRuleSetVersion(await supabaseServer(), id.data);
  redirect(`/admin/rule-sets/${newId}`);
}
