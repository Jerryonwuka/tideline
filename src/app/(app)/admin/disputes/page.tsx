import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/fleet/page-header";
import { formatMoney, money } from "@/lib/money";
import { listDisputes } from "@/server/services/escrow";
import { ResolveForm } from "./resolve-form";

/** Platform admin: frozen escrow holds (the admin layout checks the role). */
export default async function DisputesPage() {
  const [t, locale, disputes] = await Promise.all([getTranslations("adminDisputes"), getLocale(), listDisputes()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {disputes.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {disputes.map((d) => {
            const held = BigInt(d.amount_minor) - BigInt(d.released_minor) - BigInt(d.refunded_minor);
            return (
              <li
                key={d.id}
                className="flex flex-col gap-3 rounded-md border border-danger/40 p-5"
                data-testid="dispute"
              >
                <span className="title-md text-foreground">
                  {t("between", { owner: d.payee?.name ?? "", charterer: d.payer?.name ?? "" })}
                </span>
                <span className="font-mono text-sm text-foreground">
                  {t("remaining", { amount: formatMoney(money(held, d.currency), locale) })}
                </span>
                <span className="text-sm text-body">{t("reason", { reason: d.dispute_reason ?? "" })}</span>
                <ResolveForm holdId={d.id} currency={d.currency} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
