import { getTranslations } from "next-intl/server";
import { InvoiceForm } from "@/components/charter/contract-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { requireOrgContext } from "@/server/auth/session";
import { orgBasics } from "@/server/org-context";
import { vatRate } from "@/server/services/invoices";

export default async function NewInvoicePage() {
  const { db, membership } = await requireOrgContext("/invoices/new");
  const [t, org] = await Promise.all([getTranslations("invoices"), orgBasics(db, membership.orgId)]);
  const rate = await vatRate(db, org.country_code);
  const vatRegistered = !!(org.settings as { vat_registered?: boolean } | null)?.vat_registered;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("new")} subtitle={t("subtitle")} />
      <InvoiceForm currency={org.currency} vatRate={rate} vatDefault={vatRegistered} />
    </div>
  );
}
