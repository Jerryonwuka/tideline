import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { AuthShell } from "@/components/auth/auth-shell";
import { formatMoney, money } from "@/lib/money";
import { ticketCodeSchema } from "@/lib/schemas/tickets";
import { confirmByVerify, ticketByCode } from "@/server/services/payments";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ticket"))("title"), robots: { index: false } };
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** The passenger's ticket (also the return page after checkout). The QR holds only the code. */
export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const [t, format, locale] = await Promise.all([getTranslations("ticket"), getFormatter(), getLocale()]);
  const parsed = ticketCodeSchema.safeParse((await params).code);
  let ticket = parsed.success ? await ticketByCode(parsed.data) : null;
  const payment = ticket ? one(ticket.payment) : null;
  if (ticket && parsed.success && ticket.status === "reserved" && payment?.status === "initiated") {
    await confirmByVerify(payment.provider_ref);
    ticket = await ticketByCode(parsed.data);
  }
  if (!ticket) {
    return (
      <AuthShell>
        <p className="text-body">{t("notFound")}</p>
        <Link href="/tickets" className="mt-4 inline-block underline">
          {t("lookupTitle")}
        </Link>
      </AuthShell>
    );
  }
  const trip = one(ticket.trip);
  const route = trip ? one(trip.route) : null;
  const origin = route ? one(route.origin) : null;
  const destination = route ? one(route.destination) : null;
  const valid = ticket.status === "paid" || ticket.status === "used";
  const qr = valid ? await QRCode.toString(ticket.code, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;

  return (
    <AuthShell>
      <p className="label-mono-sm text-meta">{t("title")}</p>
      <h1 className="heading text-foreground">
        {origin?.name} → {destination?.name}
      </h1>
      <p className="text-body">
        {trip?.scheduled_departure &&
          format.dateTime(new Date(trip.scheduled_departure), {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: origin?.time_zone ?? "UTC",
          })}
        {" · "}
        {one(one(trip)?.org ?? null)?.name}
      </p>
      <p className="mt-4 text-lg text-foreground" data-testid="ticket-status">
        {t(`status.${ticket.status}`)}
      </p>
      {ticket.status === "reserved" && (
        <p className="text-sm text-body">
          {t("reservedHint")}{" "}
          <a href={`/tickets/${ticket.code}`} className="underline">
            {t("refresh")}
          </a>
        </p>
      )}
      {ticket.status === "cancelled" && <p className="text-sm text-body">{t("cancelledHint")}</p>}
      {ticket.status === "refunded" && <p className="text-sm text-body">{t("refundedHint")}</p>}
      {qr && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <div
            className="w-56 rounded-sm bg-white p-3"
            aria-label={ticket.code}
            role="img"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="font-mono text-2xl tracking-widest text-foreground" data-testid="ticket-code">
            {ticket.code}
          </p>
          <p className="text-sm text-body">{t("showAtJetty")}</p>
        </div>
      )}
      <dl className="mt-6 flex flex-col gap-1 border-t border-hairline pt-4 text-sm text-body">
        <div className="flex justify-between">
          <dt>{ticket.buyer_name}</dt>
          <dd>{t("seats", { count: ticket.qty })}</dd>
        </div>
        {valid && <div>{t("paid", { amount: formatMoney(money(ticket.total_minor, ticket.currency), locale) })}</div>}
      </dl>
    </AuthShell>
  );
}
