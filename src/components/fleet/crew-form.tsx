"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { crewRoleSchema, type CrewRole } from "@/lib/schemas/fleet";
import { saveCrewAction, type FleetState } from "@/app/(app)/(org)/fleet-actions";

export function CrewForm({
  next,
  defaultRole = "captain",
  lockRole = false,
  inviteDefault = false,
}: {
  next?: string;
  defaultRole?: CrewRole;
  lockRole?: boolean;
  inviteDefault?: boolean;
}) {
  const t = useTranslations("fleet.crewForm");
  const te = useTranslations("errors");
  const tRoles = useTranslations("crewRoles");
  const [state, action, pending] = useActionState<FleetState, FormData>(saveCrewAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">{t("name")}</Label>
          <Input id="fullName" name="fullName" required minLength={2} maxLength={120} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="crewRole">{t("role")}</Label>
          {lockRole ? (
            <>
              <input type="hidden" name="crewRole" value={defaultRole} />
              <Input id="crewRole" value={tRoles(defaultRole)} disabled />
            </>
          ) : (
            <NativeSelect id="crewRole" name="crewRole" defaultValue={defaultRole}>
              {crewRoleSchema.options.map((r) => (
                <option key={r} value={r}>
                  {tRoles(r)}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">{t("phone")}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="0803 123 4567"
            aria-describedby="phone-hint"
            required={inviteDefault}
          />
          <span id="phone-hint" className="text-xs text-meta">
            {t("phoneHint")}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="emergencyContactName">{t("emergencyName")}</Label>
          <Input id="emergencyContactName" name="emergencyContactName" maxLength={120} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="emergencyContactPhone">{t("emergencyPhone")}</Label>
          <Input id="emergencyContactPhone" name="emergencyContactPhone" type="tel" inputMode="tel" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-body">
        <input type="checkbox" name="invite" defaultChecked={inviteDefault} className="accent-(--accent)" />
        {t("invite")}
      </label>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
