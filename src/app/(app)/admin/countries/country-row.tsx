"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { StatusChip } from "@/components/ui/chip";
import { NativeSelect } from "@/components/ui/select";
import type { CountrySummary } from "@/server/services/countries";
import { updateCountryAction, type AdminState } from "../actions";

const STATUSES = ["planned", "validating", "pilot", "live"] as const;

export function CountryRow({
  country,
  publishedVersion,
}: {
  country: CountrySummary;
  publishedVersion: number | null;
}) {
  const t = useTranslations("admin.countries");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<AdminState, FormData>(updateCountryAction, {});
  return (
    <tr className="border-b border-hairline align-top last:border-b-0">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-meta">{country.code}</span>
        <span className="ml-2 text-foreground">{country.name}</span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-body">
        {country.defaultCurrency} · {country.defaultLocale}
        <br />
        {country.defaultTimeZone} · {country.dataRegion}
      </td>
      <td className="px-4 py-3">
        {publishedVersion ? (
          <StatusChip tone="success">{t("ruleSetVersion", { version: publishedVersion })}</StatusChip>
        ) : (
          <StatusChip tone="warning">{t("noRuleSet")}</StatusChip>
        )}
      </td>
      <td className="px-4 py-3">
        <form action={action} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="code" value={country.code} />
          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={country.enabled}
              disabled={pending}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="accent-(--accent)"
            />
            {t("enabled")}
          </label>
          <NativeSelect
            name="launchStatus"
            aria-label={t("launchStatusFor", { country: country.name })}
            defaultValue={country.launchStatus}
            disabled={pending}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-9 w-36 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </form>
        {state.error && <p className="mt-2 text-xs text-danger">{te(state.error)}</p>}
      </td>
    </tr>
  );
}
