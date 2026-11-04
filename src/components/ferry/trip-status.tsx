import { useTranslations } from "next-intl";
import { StatusChip } from "@/components/ui/chip";

export const TRIP_TONES = {
  scheduled: "neutral",
  boarding: "info",
  departed: "warning",
  arrived: "success",
  cancelled: "danger",
} as const;
export type TripStatus = keyof typeof TRIP_TONES;

export function TripStatusChip({ status, className }: { status: TripStatus; className?: string }) {
  const t = useTranslations("tripStatuses");
  return (
    <StatusChip tone={TRIP_TONES[status]} className={className}>
      {t(status)}
    </StatusChip>
  );
}
