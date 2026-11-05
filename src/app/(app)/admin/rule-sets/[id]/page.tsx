import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/ui/chip";
import { requireMe } from "@/server/auth/session";
import { ServiceError } from "@/server/services/errors";
import { getRuleSet } from "@/server/services/rule-sets";

export default async function RuleSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireMe(`/admin/rule-sets/${id}`);
  const [t, tDocs] = await Promise.all([getTranslations("admin.ruleSets"), getTranslations()]);
  const rs = await getRuleSet(db, id).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const safety = Array.isArray(rs.safety_rule_defaults) ? rs.safety_rule_defaults[0] : rs.safety_rule_defaults;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3 border-b border-hairline pb-6">
        <Link href="/admin/rule-sets" className="label-mono-sm text-meta hover:text-foreground">
          ← {t("title")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display-sm text-foreground">
            {rs.name} · v{rs.version}
          </h1>
          <StatusChip tone={rs.status === "published" ? "success" : rs.status === "draft" ? "warning" : "neutral"}>
            {t(`statuses.${rs.status}`)}
          </StatusChip>
        </div>
        {rs.legal_review_note && <p className="text-sm text-body">{rs.legal_review_note}</p>}
      </header>

      <Section title={t("sections.requirements")}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairline label-mono-sm text-meta">
              <th className="px-4 py-2 font-medium">{t("columns.document")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.appliesTo")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.modes")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.regulator")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.mandatory")}</th>
            </tr>
          </thead>
          <tbody>
            {rs.document_requirements.map((r) => (
              <tr key={r.id} className="border-b border-hairline last:border-b-0">
                <td className="px-4 py-2 text-foreground">{tDocs(`documentTypes.${r.document_type_code}`)}</td>
                <td className="px-4 py-2 text-body">{t(`appliesTo.${r.applies_to}`)}</td>
                <td className="px-4 py-2 text-body">{r.modes.length ? r.modes.join(", ") : t("allModes")}</td>
                <td className="px-4 py-2 text-body">{r.regulator?.short_name ?? "—"}</td>
                <td className="px-4 py-2 text-body">{r.mandatory ? t("yes") : t("no")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={t("sections.regulators")}>
          <ul className="px-4 py-2 text-sm">
            {rs.regulators.map((g) => (
              <li key={g.id} className="py-1 text-body">
                <span className="text-foreground">{g.short_name}</span> · {g.name}
              </li>
            ))}
            {!rs.regulators.length && <li className="py-1 text-meta">—</li>}
          </ul>
        </Section>
        <Section title={t("sections.safety")}>
          {safety ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-2 text-sm">
              <dt className="text-meta">{t("safety.wind")}</dt>
              <dd className="text-foreground">{safety.max_wind_kmh} km/h</dd>
              <dt className="text-meta">{t("safety.gust")}</dt>
              <dd className="text-foreground">{safety.max_gust_kmh} km/h</dd>
              <dt className="text-meta">{t("safety.wave")}</dt>
              <dd className="text-foreground">{safety.max_wave_m} m</dd>
              <dt className="text-meta">{t("safety.hours")}</dt>
              <dd className="text-foreground">
                {safety.permitted_start?.slice(0, 5) ?? "—"}–{safety.permitted_end?.slice(0, 5) ?? "—"}
              </dd>
            </dl>
          ) : (
            <p className="px-4 py-2 text-sm text-meta">—</p>
          )}
        </Section>
        <Section title={t("sections.tax")}>
          <ul className="px-4 py-2 text-sm">
            {rs.tax_rules.map((x) => (
              <li key={x.code} className="py-1 text-body">
                {tDocs(x.label_key)} · {x.rate_bps / 100}%
              </li>
            ))}
            {!rs.tax_rules.length && <li className="py-1 text-meta">—</li>}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-x-auto rounded-md border border-hairline">
      <h2 className="border-b border-hairline px-4 py-3 label-mono-sm text-meta">{title}</h2>
      {children}
    </section>
  );
}
