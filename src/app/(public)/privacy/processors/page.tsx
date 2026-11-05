import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { PROCESSORS } from "@/config/privacy";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("legal.processors"))("title") };
}

/** §12 public processor list and transfer register. */
export default async function ProcessorsPage() {
  const t = await getTranslations("legal.processors");
  return (
    <AuthShell wide>
      <h1 className="heading text-foreground">{t("title")}</h1>
      <p className="mb-6 text-sm text-body">{t("intro")}</p>
      <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline" data-testid="processors">
        {PROCESSORS.map((p) => (
          <li key={p.name} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-foreground">{p.name}</span>
              <span className="label-mono-sm text-meta">{t(`statuses.${p.status}`)}</span>
            </span>
            <span className="text-body">
              {t(`purposes.${p.purpose}`)} · {t(`dataKinds.${p.data}`)}
            </span>
            <span className="text-meta">
              {t("location")}: {p.location}
            </span>
          </li>
        ))}
      </ul>
    </AuthShell>
  );
}
