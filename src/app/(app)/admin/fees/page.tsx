import { getTranslations } from "next-intl/server";
import { feeAction } from "@/app/(app)/admin/console-actions";
import { ConsoleForm } from "@/components/admin/console-forms";
import { PageHeader } from "@/components/fleet/page-header";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { requireAdmin } from "@/server/admin-console";

const KEYS = ["ticket_fee_bps", "charter_commission_bps", "charter_inapp_discount_bps"] as const;

export default async function AdminFeesPage() {
  const { db } = await requireAdmin("/admin/fees");
  const [t, { data }] = await Promise.all([
    getTranslations("console.fees"),
    db
      .from("fee_config")
      .select("id, key, country_code, value, effective_from")
      .order("key")
      .order("effective_from", { ascending: false }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ul className="rounded-md border border-hairline" data-testid="admin-fees">
        {(data ?? []).map((f) => (
          <li
            key={f.id}
            className="flex justify-between gap-3 border-b border-hairline px-5 py-2 text-sm last:border-b-0"
          >
            <span className="text-foreground">
              {(KEYS as readonly string[]).includes(f.key) ? t(`keys.${f.key as (typeof KEYS)[number]}`) : f.key} ·{" "}
              {f.country_code ?? t("default")}
            </span>
            <span className="font-mono text-meta">
              {f.value} · {f.effective_from}
            </span>
          </li>
        ))}
      </ul>
      <div className="rounded-md border border-hairline p-5">
        <ConsoleForm action={feeAction} fields={{}} label={t("add")} variant="primary">
          <span className="flex flex-col gap-1">
            <Label htmlFor="fee-key">{t("key")}</Label>
            <NativeSelect id="fee-key" name="key" className="h-10 w-56">
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`keys.${k}`)}
                </option>
              ))}
            </NativeSelect>
          </span>
          <span className="flex flex-col gap-1">
            <Label htmlFor="fee-country">{t("country")}</Label>
            <Input id="fee-country" name="country" maxLength={2} className="w-24 uppercase" />
          </span>
          <span className="flex flex-col gap-1">
            <Label htmlFor="fee-value">{t("value")}</Label>
            <Input id="fee-value" name="value" type="number" min={0} max={2000} required className="w-28" />
          </span>
          <span className="flex flex-col gap-1">
            <Label htmlFor="fee-from">{t("from")}</Label>
            <Input id="fee-from" name="effectiveFrom" type="date" defaultValue={today} required className="w-44" />
          </span>
        </ConsoleForm>
      </div>
    </div>
  );
}
