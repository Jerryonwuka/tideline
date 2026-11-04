import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { formatMoney } from "@/lib/money";
import { SALE_LOOKBACK_MS, tripsForSale } from "@/server/services/payments";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("booking"))("title") };
}

/** Public booking: trips with seats in the next two days. */
export default async function BookPage() {
  const [t, format, locale] = await Promise.all([getTranslations("booking"), getFormatter(), getLocale()]);
  const now = new Date();
  const trips = await tripsForSale(
    new Date(now.getTime() - SALE_LOOKBACK_MS),
    new Date(now.getTime() + 2 * 86_400_000),
  );
  return (
    <AuthShell
      wide
      aside={
        <Link href="/tickets" className="text-sm text-body underline">
          {t("findTicket")}
        </Link>
      }
    >
      <h1 className="heading text-foreground">{t("title")}</h1>
      <p className="mb-6 text-body">{t("subtitle")}</p>
      {trips.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/book/${trip.id}`}
                className="flex flex-col gap-1 rounded-md border border-hairline-strong p-4 hover:border-foreground/40"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-lg text-foreground">
                    {t("tripTitle", { from: trip.origin, to: trip.destination })}
                  </span>
                  <span className="font-mono text-foreground">
                    {formatMoney(trip.fare, locale, { hideZeroFraction: true })}
                  </span>
                </span>
                <span className="text-sm text-body">
                  {format.dateTime(new Date(trip.departure), {
                    weekday: "short",
                    timeStyle: "short",
                    timeZone: trip.timeZone,
                  })}{" "}
                  · {t("by", { operator: trip.operator })}
                  {trip.seatsLeft != null && ` · ${t("seatsLeft", { count: trip.seatsLeft })}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AuthShell>
  );
}
