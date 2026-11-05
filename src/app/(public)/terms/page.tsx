import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("legal.terms"))("title") };
}

/** Short terms, including the §12 safety-liability statement. */
export default async function TermsPage() {
  const t = await getTranslations("legal.terms");
  const sections = t.raw("sections") as { title: string; body: string }[];
  return (
    <AuthShell wide>
      <article className="flex flex-col gap-5">
        <h1 className="heading text-foreground">{t("title")}</h1>
        <p className="text-body">{t("intro")}</p>
        {sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-2">
            <h2 className="title-md text-foreground">{s.title}</h2>
            <p className="text-sm text-body">{s.body}</p>
          </section>
        ))}
      </article>
    </AuthShell>
  );
}
