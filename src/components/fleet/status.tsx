import { useTranslations } from "next-intl";
import { StatusChip, type Tone } from "@/components/ui/chip";
import type { DocumentStatus } from "@/lib/schemas/fleet";
import { cn } from "@/lib/utils";

const TONES: Record<DocumentStatus, Tone> = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  needs_review: "info",
  rejected: "neutral",
};

export function DocumentStatusChip({ status }: { status: DocumentStatus }) {
  const t = useTranslations("documentStatuses");
  return <StatusChip tone={TONES[status]}>{t(status)}</StatusChip>;
}

/** Compliance score as a bar: green when complete, amber when partly, red when mostly missing. */
export function ScoreBar({ score, label, className }: { score: number; label?: string; className?: string }) {
  const pct = Math.round(score * 100);
  const color = pct === 100 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-danger";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
        className="h-1.5 flex-1 overflow-hidden rounded-pill bg-hairline-strong"
      >
        <div
          className={cn("h-full rounded-pill transition-[width] duration-700 ease-tide", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-xs text-foreground">{pct}%</span>
    </div>
  );
}
