import { getTranslations } from "next-intl/server";
import { requireMe } from "@/server/auth/session";
import { listAllCountries } from "@/server/services/countries";
import { listRuleSets } from "@/server/services/rule-sets";
import { CountryRow } from "./country-row";

export default async function AdminCountriesPage() {
  const { db } = await requireMe("/admin/countries");
  const [t, countries, ruleSets] = await Promise.all([
    getTranslations("admin.countries"),
    listAllCountries(db),
    listRuleSets(db),
  ]);
  const published = new Map(ruleSets.filter((r) => r.status === "published").map((r) => [r.countryCode, r.version]));
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <h1 className="display-sm text-foreground">{t("title")}</h1>
        <p className="max-w-[60ch] text-body">{t("subtitle")}</p>
      </header>
      <div className="overflow-x-auto rounded-md border border-hairline">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline label-mono-sm text-meta">
              <th className="px-4 py-3 font-medium">{t("columns.country")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.defaults")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.rules")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {countries.map((c) => (
              <CountryRow key={c.code} country={c} publishedVersion={published.get(c.code) ?? null} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-meta">{t("enableHint")}</p>
    </div>
  );
}
