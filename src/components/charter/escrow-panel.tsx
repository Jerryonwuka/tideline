import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney, money } from "@/lib/money";
import { escrowEnabled } from "@/server/features";
import type { escrowForCharter } from "@/server/services/escrow";
import { DisputeForm, HireButton, PayEscrowButton, ReleaseEarlyButton } from "./escrow-forms";

type Escrow = Awaited<ReturnType<typeof escrowForCharter>>;
interface Charter {
  id: string;
  side: "owner" | "charterer";
  status: string;
  currency: string;
  total_value_minor: number | string;
  on_hire_at: string | null;
  off_hire_at: string | null;
  on_hire_owner_at: string | null;
  on_hire_charterer_at: string | null;
  off_hire_owner_at: string | null;
  off_hire_charterer_at: string | null;
}

/** §11 escrow on the charter page: pay in, confirm on/off-hire, see releases, dispute. */
export async function EscrowPanel({ charter, escrow }: { charter: Charter; escrow: Escrow }) {
  const [t, format, locale] = await Promise.all([getTranslations("escrow"), getFormatter(), getLocale()]);
  const m = (minor: number | string | bigint) => formatMoney(money(BigInt(minor), charter.currency), locale);
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  if (!escrowEnabled()) return <p className="text-sm text-body">{t("disabled")}</p>;
  if (!escrow) {
    if (charter.status !== "pending_payment") return null;
    return charter.side === "charterer" ? (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-body">{t("payHint")}</p>
        <PayEscrowButton charterId={charter.id} label={t("pay", { amount: m(charter.total_value_minor) })} />
      </div>
    ) : (
      <p className="text-sm text-body">{t("waitingPayment")}</p>
    );
  }
  const h = escrow.hold;
  const held = BigInt(h.amount_minor) - BigInt(h.released_minor) - BigInt(h.refunded_minor);
  const mine = charter.side === "owner" ? "owner" : "charterer";
  const confirmedOn = mine === "owner" ? charter.on_hire_owner_at : charter.on_hire_charterer_at;
  const confirmedOff = mine === "owner" ? charter.off_hire_owner_at : charter.off_hire_charterer_at;
  const open = h.status === "held" || h.status === "partially_released";
  return (
    <div className="flex flex-col gap-3" data-testid="escrow-panel">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={h.status === "disputed" ? "danger" : h.status === "released" ? "success" : "info"}>
          {t(`status.${h.status}`)}
        </StatusChip>
        <span className="font-mono text-sm text-foreground" data-testid="escrow-held">
          {t("held", { held: m(held), total: m(h.amount_minor) })}
        </span>
      </div>
      {h.status === "disputed" && (
        <p className="text-sm text-danger">{t("disputed", { reason: h.dispute_reason ?? "" })}</p>
      )}
      {escrow.releases
        .filter((r) => BigInt(r.gross_minor) > 0n)
        .map((r) => {
          const payout = escrow.payouts.find((p) => BigInt(p.amount_minor) === BigInt(r.payout_minor));
          return (
            <p key={r.id} className="text-sm text-foreground" data-testid="escrow-release">
              {t("released", { amount: m(r.payout_minor) })} · {t("commission", { amount: m(r.commission_minor) })}
              {payout && charter.side === "owner" && ` · ${t(`payoutStatus.${payout.status}`)}`}
              {payout?.failure_reason === "no_bank_account" && charter.side === "owner" && ` · ${t("noAccount")}`}
            </p>
          );
        })}
      {charter.on_hire_at ? (
        <p className="text-sm text-body">{t("onHireDone", { date: when(charter.on_hire_at) })}</p>
      ) : open && confirmedOn ? (
        <p className="text-sm text-body">{t("waitingOther")}</p>
      ) : (
        open && <HireButton charterId={charter.id} stage="on" label={t("onHire")} />
      )}
      {charter.on_hire_at &&
        (charter.off_hire_at ? (
          <p className="text-sm text-body">{t("offHireDone", { date: when(charter.off_hire_at) })}</p>
        ) : open && confirmedOff ? (
          <p className="text-sm text-body">{t("waitingOther")}</p>
        ) : (
          open && <HireButton charterId={charter.id} stage="off" label={t("offHire")} />
        ))}
      {open && charter.side === "charterer" && <ReleaseEarlyButton charterId={charter.id} holdId={h.id} />}
      {open && <DisputeForm charterId={charter.id} holdId={h.id} />}
    </div>
  );
}
