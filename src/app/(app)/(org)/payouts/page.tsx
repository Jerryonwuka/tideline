import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { BankAccountForm } from "@/components/charter/escrow-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney, money } from "@/lib/money";
import { requireOrgContext } from "@/server/auth/session";

/** Owner: payout bank accounts (last 4 digits only) and charter payouts. */
export default async function PayoutsPage() {
  const { db, membership } = await requireOrgContext("/payouts");
  const [t, te, format, locale, accounts, payouts] = await Promise.all([
    getTranslations("payouts"),
    getTranslations("escrow"),
    getFormatter(),
    getLocale(),
    db.from("bank_accounts").select("id, account_name, account_number_last4, verified").eq("org_id", membership.orgId),
    db
      .from("payouts")
      .select("id, currency, amount_minor, commission_minor, status, created_at")
      .eq("org_id", membership.orgId)
      .order("created_at", { ascending: false }),
  ]);
  const m = (minor: number | string, currency: string) => formatMoney(money(BigInt(minor), currency), locale);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <section className="flex flex-col gap-3">
        <h2 className="title-md text-foreground">{t("accounts")}</h2>
        {!accounts.data?.length ? (
          <p className="text-body">{t("noAccounts")}</p>
        ) : (
          <ul className="rounded-md border border-hairline" data-testid="bank-accounts">
            {accounts.data.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between border-b border-hairline px-5 py-3 text-sm last:border-b-0"
              >
                <span className="text-foreground">
                  {t("account", { name: a.account_name, last4: a.account_number_last4 })}
                </span>
                {a.verified && <StatusChip tone="success">{t("verified")}</StatusChip>}
              </li>
            ))}
          </ul>
        )}
        {membership.role === "owner" && (
          <div className="rounded-md border border-hairline p-5">
            <h3 className="mb-3 title-md text-foreground">{t("add")}</h3>
            <BankAccountForm />
          </div>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="title-md text-foreground">{t("list")}</h2>
        {!payouts.data?.length ? (
          <p className="text-body">{t("empty")}</p>
        ) : (
          <ul className="rounded-md border border-hairline" data-testid="payouts">
            {payouts.data.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3 text-sm last:border-b-0"
              >
                <span className="font-mono text-foreground">
                  {t("row", { amount: m(p.amount_minor, p.currency), commission: m(p.commission_minor, p.currency) })}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-meta">{format.dateTime(new Date(p.created_at), { dateStyle: "medium" })}</span>
                  <StatusChip tone={p.status === "success" ? "success" : p.status === "pending" ? "info" : "danger"}>
                    {te(`payoutStatus.${p.status}`)}
                  </StatusChip>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
