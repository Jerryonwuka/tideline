import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AcceptContractForm, GenerateContractForm } from "@/components/charter/contract-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney, money } from "@/lib/money";
import { uuid } from "@/lib/schemas/common";
import { requireOrgContext } from "@/server/auth/session";
import { getContractForCharter, listCharters, listTemplates, signedPdfUrl } from "@/server/services/contracts";
import { vatRate } from "@/server/services/invoices";
import { orgBasics } from "@/server/org-context";
import { invoiceCharterAction } from "../../contract-actions";

/** A charter: terms, the contract (create, accept, PDF) and invoicing. */
export default async function CharterPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = uuid.safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db, membership } = await requireOrgContext(`/charters/${parsed.data}`);
  const charter = (await listCharters(db, membership.orgId)).find((c) => c.id === parsed.data);
  if (!charter) notFound();
  const [t, tk, ti, format, locale, contract, templates, org] = await Promise.all([
    getTranslations("charter.charters"),
    getTranslations("contracts"),
    getTranslations("invoices"),
    getFormatter(),
    getLocale(),
    getContractForCharter(db, charter.id),
    listTemplates(db),
    orgBasics(db, membership.orgId),
  ]);
  const pdfUrl = contract ? await signedPdfUrl(contract.pdf_path) : null;
  const isOwner = charter.side === "owner" && (membership.role === "owner" || membership.role === "manager");
  const meta = (contract?.acceptance_meta ?? {}) as Record<string, { name?: string }>;
  const mySide = charter.side;
  const myAccepted = contract
    ? mySide === "owner"
      ? contract.owner_accepted_at
      : contract.charterer_accepted_at
    : null;
  const canAccept = contract && !myAccepted && (mySide === "owner" ? membership.role === "owner" : true);
  const anyAccepted = !!(contract?.owner_accepted_at || contract?.charterer_accepted_at);
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const vat = isOwner ? await vatRate(db, org.country_code) : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("detailTitle", {
          vessel: charter.vesselName,
          client: charter.side === "owner" ? charter.chartererName : charter.ownerName,
        })}
        subtitle={`${t("dates", { from: date(charter.start_date), to: date(charter.end_date) })} · ${t("total", { amount: formatMoney(money(BigInt(charter.total_value_minor), charter.currency), locale) })}`}
        eyebrow={
          <StatusChip tone="info" className="w-fit">
            {t(`status.${charter.status}`)}
          </StatusChip>
        }
      />
      {charter.booked_on_platform ? (
        <p className="text-sm text-body">{t("commission", { pct: charter.commission_bps / 100 })}</p>
      ) : (
        <p className="text-sm text-body">{t("offPlatform")}</p>
      )}

      {charter.booked_on_platform && (
        <section className="flex flex-col gap-4" aria-labelledby="contract">
          <h2 id="contract" className="title-md text-foreground">
            {tk("title")}
          </h2>
          {!contract ? (
            isOwner ? (
              <GenerateContractForm
                charterId={charter.id}
                templates={templates.map((x) => ({ id: x.id, label: x.name }))}
                label={tk("generate")}
              />
            ) : (
              <p className="text-body">{tk("none")}</p>
            )
          ) : (
            <>
              <pre
                className="max-h-96 overflow-auto rounded-sm border border-hairline bg-surface-sunken p-4 font-sans text-sm whitespace-pre-wrap text-foreground"
                data-testid="contract-body"
              >
                {contract.body_html}
              </pre>
              <ul className="flex flex-col gap-1 text-sm" data-testid="contract-acceptance">
                {(["owner", "charterer"] as const).map((side) => {
                  const at = side === "owner" ? contract.owner_accepted_at : contract.charterer_accepted_at;
                  return (
                    <li key={side} className="text-foreground">
                      {at
                        ? tk("accepted", {
                            side: tk(`sides.${side}`),
                            name: meta[side]?.name ?? "",
                            date: format.dateTime(new Date(at), { dateStyle: "medium", timeStyle: "short" }),
                          })
                        : tk("pending", { side: tk(`sides.${side}`).toLowerCase() })}
                    </li>
                  );
                })}
              </ul>
              {contract.owner_accepted_at && contract.charterer_accepted_at && (
                <p className="text-foreground">{tk("bothAccepted")}</p>
              )}
              {pdfUrl && (
                <a href={pdfUrl} className="w-fit label-mono-sm text-accent hover:underline" data-testid="contract-pdf">
                  {tk("pdf")}
                </a>
              )}
              {canAccept && <AcceptContractForm charterId={charter.id} contractId={contract.id} />}
              {isOwner && !anyAccepted && (
                <GenerateContractForm
                  charterId={charter.id}
                  templates={templates.map((x) => ({ id: x.id, label: x.name }))}
                  label={tk("regenerate")}
                />
              )}
            </>
          )}
        </section>
      )}

      {isOwner && (
        <form action={invoiceCharterAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="charterId" value={charter.id} />
          {vat != null && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" name="addVat" />
              {ti("fields.addVat", { rate: vat / 100 })}
            </label>
          )}
          <Button type="submit" variant="secondary">
            {ti("fromCharter")}
          </Button>
        </form>
      )}
    </div>
  );
}
