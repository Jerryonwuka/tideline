import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { DataRequestForm, MarketingForm } from "@/components/app/privacy-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { requireMe } from "@/server/auth/session";
import { myConsents, myRequests } from "@/server/services/privacy";
import { signOutEverywhereAction } from "./actions";

/** §12 rights from settings: consent, export, deletion, sign out everywhere. */
export default async function PrivacySettingsPage() {
  const { db, me } = await requireMe("/settings/privacy");
  const [t, format, consents, requests] = await Promise.all([
    getTranslations("settingsPrivacy"),
    getFormatter(),
    myConsents(db, me.userId),
    myRequests(db, me.userId),
  ]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  return (
    <AuthShell wide>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="heading text-foreground">{t("title")}</h1>
          <p className="text-body">{t("subtitle")}</p>
          <Link href="/privacy" className="text-sm text-accent hover:underline">
            {t("notice")}
          </Link>
        </header>

        <MarketingForm granted={consents.marketing === true} />

        <section className="flex flex-col gap-2">
          <h2 className="title-md text-foreground">{t("export")}</h2>
          <p className="text-sm text-body">{t("exportHint")}</p>
          <DataRequestForm kind="export" />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="title-md text-foreground">{t("delete")}</h2>
          <p className="text-sm text-body">{t("deleteHint")}</p>
          <DataRequestForm kind="delete" />
        </section>

        {requests.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="title-md text-foreground">{t("requests")}</h2>
            <ul className="rounded-md border border-hairline" data-testid="privacy-requests">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3 text-sm last:border-b-0"
                >
                  <span className="flex flex-col">
                    <span className="text-foreground">{t(`kind.${r.kind}`)}</span>
                    <span className="text-meta">
                      {r.status === "pending"
                        ? t("due", { date: date(r.due_at) })
                        : r.handled_at
                          ? date(r.handled_at)
                          : ""}
                      {r.note === "sole_owner" ? ` · ${t("notes.sole_owner")}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {r.export_path && (
                      <a
                        href={`/api/v1/privacy/requests/${r.id}/download`}
                        className="text-accent hover:underline"
                        data-testid="privacy-download"
                      >
                        {t("download")}
                      </a>
                    )}
                    <StatusChip
                      tone={r.status === "completed" ? "success" : r.status === "pending" ? "info" : "neutral"}
                    >
                      {t(`status.${r.status}`)}
                    </StatusChip>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="title-md text-foreground">{t("sessions")}</h2>
          <p className="text-sm text-body">{t("sessionsHint")}</p>
          <form action={signOutEverywhereAction}>
            <Button type="submit" variant="secondary">
              {t("signOutEverywhere")}
            </Button>
          </form>
        </section>
      </div>
    </AuthShell>
  );
}
