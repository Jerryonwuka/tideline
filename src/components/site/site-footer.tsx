import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";

export async function SiteFooter() {
  const t = await getTranslations("home.footer");
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-[88rem] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <Logo size={20} />
        <div className="flex flex-col gap-1 sm:items-end">
          <span className="label-mono-sm text-meta">{t("line")}</span>
          <span className="text-sm text-meta">{t("rights", { year: new Date().getUTCFullYear() })}</span>
        </div>
      </div>
    </footer>
  );
}
