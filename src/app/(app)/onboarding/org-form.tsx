"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createOrgAction, type FormState } from "./actions";

const TYPES = ["ferry_operator", "vessel_owner", "charterer", "barge_operator"] as const;
const MODES = ["ferry", "charter"] as const;

export function OrgForm({
  countries,
}: {
  countries: { code: string; name: string; currency: string; timeZone: string }[];
}) {
  const t = useTranslations("onboarding");
  const te = useTranslations("errors");
  const tTypes = useTranslations("orgTypes");
  const tTypeHints = useTranslations("orgTypeHints");
  const tModes = useTranslations("modeNames");
  const tModeHints = useTranslations("modeHints");
  const [state, action, pending] = useActionState<FormState, FormData>(createOrgAction, {});
  const [countryCode, setCountryCode] = useState(countries[0]?.code ?? "");
  const country = countries.find((c) => c.code === countryCode);

  return (
    <form action={action} className="flex flex-col gap-6">
      <div>
        <span className="label-mono-sm text-accent">{t("step", { current: 2, total: 5 })}</span>
        <h1 className="mt-3 heading text-foreground">{t("org.title")}</h1>
        <p className="mt-2 text-sm text-body">{t("org.subtitle")}</p>
      </div>
      <FormError message={state.error ? te(state.error) : null} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("org.nameLabel")}</Label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="organization"
          placeholder={t("org.namePlaceholder")}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 label-mono-sm text-meta">{t("org.typeLabel")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TYPES.map((type, i) => (
            <label
              key={type}
              className="group/opt flex cursor-pointer flex-col gap-1 rounded-sm border border-hairline-strong p-3 transition-colors hover:border-foreground/30 has-checked:border-accent has-checked:bg-accent-soft"
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <input type="radio" name="type" value={type} defaultChecked={i === 0} className="accent-(--accent)" />
                {tTypes(type)}
              </span>
              <span className="pl-5 text-xs text-meta">{tTypeHints(type)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={cn("mb-2 label-mono-sm", state.error === "invalid_modes" ? "text-danger" : "text-meta")}>
          {t("org.modesLabel")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((mode, i) => (
            <label
              key={mode}
              className="flex cursor-pointer flex-col gap-1 rounded-sm border border-hairline-strong p-3 transition-colors hover:border-foreground/30 has-checked:border-accent has-checked:bg-accent-soft"
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="modes"
                  value={mode}
                  defaultChecked={i === 0}
                  className="accent-(--accent)"
                />
                {tModes(mode)}
              </span>
              <span className="pl-5 text-xs text-meta">{tModeHints(mode)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="countryCode">{t("org.countryLabel")}</Label>
          <NativeSelect
            id="countryCode"
            name="countryCode"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          {country && (
            <p className="text-xs text-meta">
              {t("org.countryDefaults", { currency: country.currency, timeZone: country.timeZone })}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="region">{t("org.regionLabel")}</Label>
          <Input id="region" name="region" maxLength={80} placeholder={t("org.regionPlaceholder")} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="registrationNumber">{t("org.registrationLabel")}</Label>
        <Input id="registrationNumber" name="registrationNumber" maxLength={60} />
        <p className="text-xs text-meta">{t("org.registrationHint")}</p>
      </div>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("org.creating") : t("org.submit")}
      </Button>
    </form>
  );
}
