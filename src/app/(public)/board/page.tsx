import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { StatusChip } from "@/components/ui/chip";
import { formatMoney } from "@/lib/money";
import { boardQuerySchema } from "@/lib/schemas/charter";
import { boardListings } from "@/server/services/charter";
import { logBoardSearch } from "@/server/services/idle";
import { getMe } from "@/server/services/profile";
import { supabaseServer } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("charter.board"))("title") };
}

const TYPES = ["crew_boat", "osv", "tug", "barge", "speedboat", "ferry", "other"] as const;

/** Public spot-charter board (§4.3): live listings, filters; never private documents. */
export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const parsed = boardQuerySchema.safeParse(await searchParams);
  const q = parsed.success ? parsed.data : {};
  // Signed-in charterers' searches (type and area only) help owners find likely buyers (§10.4).
  if (q.type || q.area) {
    const me = await getMe(await supabaseServer()).catch(() => null);
    if (me)
      await logBoardSearch(
        me.memberships.filter((m) => m.status === "active").map((m) => m.orgId),
        q,
      ).catch(() => {});
  }
  const [t, tTypes, format, locale, listings] = await Promise.all([
    getTranslations("charter.board"),
    getTranslations("vesselTypes"),
    getFormatter(),
    getLocale(),
    boardListings({ type: q.type, area: q.area, from: q.from, to: q.to, minCapacity: q.min_capacity }),
  ]);
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const field = "h-10 rounded-xs border border-hairline-strong bg-surface-sunken px-3 text-sm text-foreground";
  return (
    <AuthShell wide>
      <h1 className="heading text-foreground">{t("title")}</h1>
      <p className="mb-6 text-body">{t("subtitle")}</p>
      <form className="mb-6 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-mono-sm text-meta">{t("filters.type")}</span>
          <select name="type" defaultValue={q.type ?? ""} className={field}>
            <option value="">{t("filters.any")}</option>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {tTypes(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-mono-sm text-meta">{t("filters.area")}</span>
          <input name="area" defaultValue={q.area ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-mono-sm text-meta">{t("filters.minCapacity")}</span>
          <input name="min_capacity" type="number" min={0} defaultValue={q.min_capacity ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-mono-sm text-meta">{t("filters.from")}</span>
          <input name="from" type="date" defaultValue={q.from ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-mono-sm text-meta">{t("filters.to")}</span>
          <input name="to" type="date" defaultValue={q.to ?? ""} className={field} />
        </label>
        <button
          type="submit"
          className="h-10 self-end rounded-xs border border-hairline-strong label-mono-sm text-foreground"
        >
          {t("filters.apply")}
        </button>
      </form>
      {listings.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="board-list">
          {listings.map((l) => (
            <li key={l.id}>
              <Link
                href={`/board/${l.id}`}
                className="flex flex-col gap-2 rounded-md border border-hairline-strong p-4 hover:border-foreground/40"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg text-foreground">{l.vessel.name}</span>
                  <span className="font-mono text-foreground">
                    {t("perDay", { amount: formatMoney(l.dayRate, locale, { hideZeroFraction: true }) })}
                  </span>
                </span>
                <span className="text-sm text-body">
                  {tTypes(l.vessel.type as (typeof TYPES)[number])} · {l.operatingArea} ·{" "}
                  {t("minDays", { count: l.minDays })} ·{" "}
                  {l.availableFrom && l.availableTo
                    ? t("available", { from: date(l.availableFrom), to: date(l.availableTo) })
                    : t("availableAny")}
                </span>
                <span className="flex flex-wrap gap-2">
                  <StatusChip tone={l.operator.verified ? "success" : "neutral"}>
                    {l.operator.verified ? t("verified") : t("unverified")}
                  </StatusChip>
                  {l.compliance != null && (
                    <StatusChip tone="info">{t("compliance", { score: l.compliance })}</StatusChip>
                  )}
                  <span className="text-sm text-meta">{l.operator.name}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AuthShell>
  );
}
