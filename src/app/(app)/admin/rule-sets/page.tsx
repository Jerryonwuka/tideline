import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { requireMe } from "@/server/auth/session";
import { listRuleSets } from "@/server/services/rule-sets";
import { newVersionAction } from "../actions";
import { PublishForm } from "./publish-form";

const TONE = { published: "success", draft: "warning", retired: "neutral" } as const;

export default async function AdminRuleSetsPage() {
  const { db } = await requireMe("/admin/rule-sets");
  const [t, format, ruleSets] = await Promise.all([
    getTranslations("admin.ruleSets"),
    getFormatter(),
    listRuleSets(db),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <h1 className="display-sm text-foreground">{t("title")}</h1>
        <p className="max-w-[60ch] text-body">{t("subtitle")}</p>
      </header>
      <ul className="rounded-md border border-hairline">
        {ruleSets.map((r) => {
          const label = `${r.countryCode ?? t("global")} · v${r.version}`;
          return (
            <li
              key={r.id}
              className="grid gap-4 border-b border-hairline px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
            >
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/admin/rule-sets/${r.id}`} className="title-md text-foreground hover:text-accent">
                    {r.name} · v{r.version}
                  </Link>
                  <span className="font-mono text-xs text-meta">{r.countryCode ?? t("global")}</span>
                  <StatusChip tone={TONE[r.status]}>{t(`statuses.${r.status}`)}</StatusChip>
                </div>
                <span className="text-sm text-body">
                  {t("requirementCount", { count: r.requirementCount })}
                  {r.publishedAt &&
                    ` · ${t("publishedOn", { date: format.dateTime(new Date(r.publishedAt), { dateStyle: "medium" }) })}`}
                </span>
                {r.legalReviewNote && <span className="text-xs text-meta">{r.legalReviewNote}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {r.status === "draft" && <PublishForm id={r.id} label={label} />}
                <form action={newVersionAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {t("newVersion")}
                  </Button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
