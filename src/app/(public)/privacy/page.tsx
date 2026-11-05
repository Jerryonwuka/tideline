import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { DEFAULT_RETENTION_MONTHS, PRIVACY_NOTICE_VERSION, dataHosting } from "@/config/privacy";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("legal.privacy"))("title") };
}

type Section = { title: string; body: string };

/** §12 public privacy notice. */
export default async function PrivacyPage() {
  const [t, tl, format] = await Promise.all([
    getTranslations("legal.privacy"),
    getTranslations("legal"),
    getFormatter(),
  ]);
  const sections = t.raw("sections") as Section[];
  const hosting = dataHosting();
  return (
    <AuthShell wide>
      <article className="flex flex-col gap-5" data-testid="privacy-notice">
        <h1 className="heading text-foreground">{t("title")}</h1>
        <p className="label-mono-sm text-meta">
          {tl("updated", {
            date: format.dateTime(new Date(`${PRIVACY_NOTICE_VERSION}T00:00:00Z`), {
              dateStyle: "long",
              timeZone: "UTC",
            }),
          })}
        </p>
        <p className="text-body">{t("intro")}</p>
        {sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-2">
            <h2 className="title-md text-foreground">{s.title}</h2>
            <p className="text-sm text-body">{s.body.replace("{months}", String(DEFAULT_RETENTION_MONTHS))}</p>
          </section>
        ))}
        <p className="text-sm text-foreground">{hosting ? t("hosting", { hosting }) : t("hostingUnset")}</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/privacy/processors" className="text-accent hover:underline">
            {t("processorsLink")}
          </Link>
          <Link href="/settings/privacy" className="text-accent hover:underline">
            {t("requestLink")}
          </Link>
        </div>
      </article>
    </AuthShell>
  );
}
