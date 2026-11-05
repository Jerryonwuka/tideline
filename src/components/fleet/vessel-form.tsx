"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { vesselTypeSchema } from "@/lib/schemas/fleet";
import { saveVesselAction, type FleetState } from "@/app/(app)/(org)/fleet-actions";

interface VesselDefaults {
  id?: string;
  name?: string;
  type?: string;
  registration_no?: string | null;
  imo?: string | null;
  mmsi?: string | null;
  year_built?: number | null;
  length_m?: number | null;
  passenger_capacity?: number | null;
  cargo_capacity_t?: number | null;
  engine?: string | null;
  crew_complement?: number | null;
  speed_kn?: number | null;
  deck_space_m2?: number | null;
  dp_class?: string | null;
  ferry_enabled?: boolean;
  charter_enabled?: boolean;
}

export function VesselForm({ vessel, next, orgModes }: { vessel?: VesselDefaults; next?: string; orgModes: string[] }) {
  const t = useTranslations("fleet.vesselForm");
  const te = useTranslations("errors");
  const tTypes = useTranslations("vesselTypes");
  const tModes = useTranslations("modeNames");
  const [state, action, pending] = useActionState<FleetState, FormData>(saveVesselAction, {});
  const field = (name: string) => (state.fields?.[name] ? true : undefined);
  const modes = ["ferry", "charter"].filter((m) => orgModes.includes(m));

  return (
    <form action={action} className="flex flex-col gap-5">
      {vessel?.id && <input type="hidden" name="id" value={vessel.id} />}
      {next && <input type="hidden" name="next" value={next} />}
      <FormError message={state.error ? te(state.error) : null} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={vessel?.name}
            placeholder={t("namePlaceholder")}
            aria-invalid={field("name")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">{t("type")}</Label>
          <NativeSelect
            id="type"
            name="type"
            defaultValue={vessel?.type ?? (orgModes.includes("ferry") ? "ferry" : "crew_boat")}
          >
            {vesselTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {tTypes(type)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="passengerCapacity">{t("passengers")}</Label>
          <Input
            id="passengerCapacity"
            name="passengerCapacity"
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            defaultValue={vessel?.passenger_capacity ?? undefined}
            aria-invalid={field("passengerCapacity")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="registrationNo">{t("registration")}</Label>
          <Input
            id="registrationNo"
            name="registrationNo"
            maxLength={60}
            defaultValue={vessel?.registration_no ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="imo">{t("imo")}</Label>
          <Input
            id="imo"
            name="imo"
            inputMode="numeric"
            pattern="\d{7}"
            defaultValue={vessel?.imo ?? undefined}
            aria-invalid={field("imo")}
            aria-describedby="imo-hint"
          />
          <span id="imo-hint" className="text-xs text-meta">
            {t("imoHint")}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lengthM">{t("length")}</Label>
          <Input
            id="lengthM"
            name="lengthM"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            defaultValue={vessel?.length_m ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="yearBuilt">{t("year")}</Label>
          <Input
            id="yearBuilt"
            name="yearBuilt"
            type="number"
            inputMode="numeric"
            min={1900}
            max={2100}
            defaultValue={vessel?.year_built ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cargoCapacityT">{t("cargo")}</Label>
          <Input
            id="cargoCapacityT"
            name="cargoCapacityT"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            defaultValue={vessel?.cargo_capacity_t ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="engine">{t("engine")}</Label>
          <Input id="engine" name="engine" maxLength={120} defaultValue={vessel?.engine ?? undefined} />
        </div>
      </div>
      {modes.includes("charter") && (
        <fieldset className="grid gap-4 sm:grid-cols-4">
          <legend className="mb-2 label-mono-sm text-meta">{t("charterProfile")}</legend>
          {(
            [
              ["crewComplement", "crew_complement", "numeric"],
              ["speedKn", "speed_kn", "decimal"],
              ["deckSpaceM2", "deck_space_m2", "decimal"],
              ["dpClass", "dp_class", "text"],
            ] as const
          ).map(([name, key, mode]) => (
            <div key={name} className="flex flex-col gap-2">
              <Label htmlFor={name}>{t(name)}</Label>
              <Input id={name} name={name} inputMode={mode} defaultValue={vessel?.[key] ?? undefined} />
            </div>
          ))}
        </fieldset>
      )}
      {modes.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 label-mono-sm text-meta">{t("modes")}</legend>
          <div className="flex flex-wrap gap-2">
            {modes.map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-center gap-2 rounded-sm border border-hairline-strong px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent-soft"
              >
                <input
                  type="checkbox"
                  name="modes"
                  value={mode}
                  defaultChecked={vessel ? (mode === "ferry" ? vessel.ferry_enabled : vessel.charter_enabled) : true}
                  className="accent-(--accent)"
                />
                {tModes(mode)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
