"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { assignCrewAction, type FleetState } from "@/app/(app)/(org)/fleet-actions";

export function AssignCrewForm({ vesselId, options }: { vesselId: string; options: { id: string; label: string }[] }) {
  const t = useTranslations("fleet.vessel");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FleetState, FormData>(assignCrewAction, {});
  if (!options.length) return <p className="text-sm text-meta">{t("noCrewToAssign")}</p>;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="vesselId" value={vesselId} />
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="label-mono-sm text-meta">{t("assignLabel")}</span>
        <NativeSelect name="crewMemberId" className="h-9 text-sm">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="h-9">
        {t("assign")}
      </Button>
      {state.error && <span className="w-full text-xs text-danger">{te(state.error)}</span>}
    </form>
  );
}
