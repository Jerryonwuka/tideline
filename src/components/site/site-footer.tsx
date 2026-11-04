import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const PRODUCT = [
  { href: "#platform", key: "platform" },
  { href: "#fleet", key: "fleet" },
  { href: "#process", key: "process" },
  { href: "#modes", key: "modes" },
] as const;

export async function SiteFooter() {
  const t = await getTranslations("home.footer");
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-[84rem] border-x border-hairline">
        <div className="grid gap-12 px-6 py-16 sm:px-12 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <Logo size={22} />
            <p className="max-w-[32ch] text-sm text-body">{t("line")}</p>
          </div>
          <FooterColumn title={t("columns.product")}>
            {PRODUCT.map((l) => (
              <a key={l.key} href={l.href} className="text-sm text-body transition-colors hover:text-foreground">
                {t(`links.${l.key}`)}
              </a>
            ))}
          </FooterColumn>
          <FooterColumn title={t("columns.company")}>
            <a href="#faq" className="text-sm text-body transition-colors hover:text-foreground">
              {t("links.faq")}
            </a>
            <Link href="/login" className="text-sm text-body transition-colors hover:text-foreground">
              {t("links.login")}
            </Link>
          </FooterColumn>
          <FooterColumn title={t("columns.legal")}>
            {(["privacy", "processors", "terms"] as const).map((k) => (
              <Link
                key={k}
                href={k === "processors" ? "/privacy/processors" : `/${k}`}
                className="text-sm text-body transition-colors hover:text-foreground"
              >
                {t(`links.${k}`)}
              </Link>
            ))}
          </FooterColumn>
        </div>
        <div className="flex flex-col gap-4 border-t border-hairline px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-12">
          <span className="label-mono-sm text-meta">
            {t("rights", { year: new Date().getUTCFullYear() })} · {t("made")}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="label-mono-sm text-meta">{title}</span>
      {children}
    </div>
  );
}
