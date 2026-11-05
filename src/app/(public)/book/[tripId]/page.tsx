import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { formatMoney, toJson } from "@/lib/money";
import { uuid } from "@/lib/schemas/common";
import { ServiceError } from "@/server/services/errors";
import { saleQuote } from "@/server/services/payments";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export default async function BookTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const parsed = uuid.safeParse((await params).tripId);
  if (!parsed.success) notFound();
  const quote = await saleQuote(parsed.data, 1).catch((err) => {
    if (err instanceof ServiceError && err.code === "not_found") notFound();
    throw err;
  });
  const { trip } = quote;
  if (!["scheduled", "boarding"].includes(trip.status)) notFound();
  const [t, format, locale] = await Promise.all([getTranslations("booking"), getFormatter(), getLocale()]);
  const zone = trip.route!.origin?.time_zone ?? "UTC";
  return (
    <AuthShell>
      <h1 className="heading text-foreground">
        {t("tripTitle", { from: trip.route!.origin?.name ?? "", to: trip.route!.destination?.name ?? "" })}
      </h1>
      <p className="text-body">
        {trip.scheduled_departure &&
          t("departs", {
            time: format.dateTime(new Date(trip.scheduled_departure), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: zone,
            }),
          })}{" "}
        · {t("by", { operator: trip.org!.name })}
      </p>
      <p className="mt-2 mb-6 text-sm text-body">
        {t("fare")}: {formatMoney(quote.fare, locale)}
        {quote.seatsLeft != null && ` · ${t("seatsLeft", { count: quote.seatsLeft })}`}
      </p>
      <BookingForm
        tripId={trip.id}
        fare={toJson(quote.fare)}
        feeBps={quote.bps}
        bearer={quote.bearer}
        maxSeats={Math.min(quote.seatsLeft ?? 20, 20)}
        locale={locale}
      />
    </AuthShell>
  );
}
