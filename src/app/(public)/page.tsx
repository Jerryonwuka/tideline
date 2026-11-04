import { Anchor, CloudOff, Ship, Smartphone } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { TideWaves } from "@/components/brand/tide-waves";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardEyebrow, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip, Tag, type Tone } from "@/components/ui/chip";

interface Trip {
  vessel: string;
  route: string;
  time: string;
  status: string;
  tone: Tone;
}

interface Row {
  label: string;
  value: string;
  limit: string;
}

export default async function HomePage() {
  const t = await getTranslations("home");
  const pillars = t.raw("hero.pillars") as string[];
  const trips = t.raw("preview.trips") as Trip[];
  const safetyRows = t.raw("preview.safety.rows") as Row[];
  const ferryItems = t.raw("modes.ferry.items") as string[];
  const charterItems = t.raw("modes.charter.items") as string[];
  const checks = t.raw("safety.checks") as { title: string; body: string }[];
  const fieldItems = t.raw("field.items") as { title: string; body: string }[];
  const fieldIcons = [CloudOff, Anchor, Smartphone];

  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero — Figma "00 — Cover v2" */}
        <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
          <TideWaves className="-z-10" />
          <div className="mx-auto flex w-full max-w-[88rem] flex-1 flex-col items-center justify-center px-4 pt-28 pb-16 text-center sm:px-8">
            <Reveal>
              <Tag>{t("hero.tag")}</Tag>
            </Reveal>
            <Reveal delay={120}>
              <h1 className="mt-6 max-w-[14ch] display-xl text-balance text-foreground">{t("hero.title")}</h1>
            </Reveal>
            <Reveal delay={240}>
              <p className="mt-6 max-w-[44ch] body-lg text-pretty text-body">{t("hero.body")}</p>
            </Reveal>
            <Reveal delay={360} className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" nativeButton={false} render={<a href="#access" />}>
                {t("hero.primary")}
              </Button>
              <Button size="lg" variant="secondary" nativeButton={false} render={<a href="#modes" />}>
                {t("hero.secondary")}
              </Button>
            </Reveal>
          </div>
          <Reveal delay={600} className="mx-auto w-full max-w-[88rem] px-4 pb-10 sm:px-8">
            <ol className="flex flex-wrap justify-center gap-x-10 gap-y-3">
              {pillars.map((p, i) => (
                <li key={p} className="label-mono-sm text-meta">
                  <span className="mr-3 text-accent">{String(i + 1).padStart(2, "0")}</span>
                  {p}
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* Product preview: a calm control room */}
        <Section>
          <Reveal className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline shadow-lg lg:grid-cols-[1.6fr_1fr]">
            <div className="bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-4 sm:px-6">
                <span className="label-mono-sm text-meta">
                  {t("preview.fleetStatus")} · <CountUp to={11} className="text-foreground" />{" "}
                  {t("preview.underwayOf", { total: 14 })}
                </span>
                <Tag>{t("preview.tag")}</Tag>
              </div>
              <div className="px-6 pt-6 pb-2">
                <h2 className="heading text-foreground">{t("preview.departures")}</h2>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="label-mono-sm text-meta">
                    <th className="px-4 py-3 font-medium sm:px-6">{t("preview.columns.vessel")}</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell sm:px-6">{t("preview.columns.route")}</th>
                    <th className="px-4 py-3 font-medium sm:px-6">{t("preview.columns.time")}</th>
                    <th className="px-4 py-3 text-right font-medium sm:px-6">{t("preview.columns.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip) => (
                    <tr
                      key={trip.vessel}
                      className="border-t border-hairline transition-colors duration-(--duration-hover) ease-hover hover:bg-surface-raised"
                    >
                      <td className="px-4 py-4 body-md text-foreground sm:px-6">{trip.vessel}</td>
                      <td className="hidden px-4 py-4 body-md text-body sm:table-cell sm:px-6">{trip.route}</td>
                      <td className="px-4 py-4 font-mono text-sm text-body sm:px-6">{trip.time}</td>
                      <td className="px-4 py-4 text-right sm:px-6">
                        <StatusChip tone={trip.tone} pulse>
                          {trip.status}
                        </StatusChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-px bg-hairline">
              <div className="bg-surface p-6">
                <Card className="bg-background shadow-md transition-transform duration-(--duration-tide) ease-tide hover:-translate-y-0.5">
                  <CardHeader>
                    <CardEyebrow>
                      <Ship />
                      {t("preview.card.vessel")}
                    </CardEyebrow>
                    <CardTitle className="title-lg">{t("preview.card.title")}</CardTitle>
                    <CardDescription>{t("preview.card.body")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StatusChip tone="success">{t("preview.card.chip")}</StatusChip>
                  </CardContent>
                </Card>
              </div>
              <div className="flex-1 bg-surface p-6">
                <div className="flex items-center justify-between">
                  <span className="label-mono-sm text-meta">{t("preview.safety.eyebrow")}</span>
                  <StatusChip tone="success">{t("preview.safety.result")}</StatusChip>
                </div>
                <dl className="mt-4">
                  {safetyRows.map((row) => (
                    <div
                      key={row.label}
                      className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-t border-hairline py-3"
                    >
                      <dt className="text-sm text-body">{row.label}</dt>
                      <dd className="text-right text-sm text-foreground">{row.value}</dd>
                      <dd className="col-span-2 label-mono-sm text-meta">{row.limit}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </Reveal>
        </Section>

        {/* Modes */}
        <Section id="modes" tag={t("modes.tag")} title={t("modes.title")} body={t("modes.body")}>
          <Reveal className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline md:grid-cols-2">
            {[
              { key: "ferry", items: ferryItems },
              { key: "charter", items: charterItems },
            ].map((mode, i) => (
              <div key={mode.key} className="group/cell bg-surface p-8 sm:p-10">
                <span className="label-mono-sm text-accent">
                  {String(i + 1).padStart(2, "0")} · {t(`modes.${mode.key}.label`)}
                </span>
                <h3 className="mt-4 heading text-foreground">{t(`modes.${mode.key}.title`)}</h3>
                <ul className="mt-8">
                  {mode.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 border-t border-hairline py-4 body-md text-body transition-colors duration-(--duration-hover) ease-hover hover:text-foreground"
                    >
                      <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Reveal>
        </Section>

        {/* Safety lock */}
        <Section id="safety" tag={t("safety.tag")} title={t("safety.title")} body={t("safety.body")}>
          <Reveal className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
            {checks.map((check, i) => (
              <div
                key={check.title}
                className="bg-surface p-8 transition-colors duration-(--duration-tide) ease-tide hover:bg-surface-raised"
              >
                <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-10 title-md text-foreground">{check.title}</h3>
                <p className="mt-3 text-sm leading-6 text-body">{check.body}</p>
              </div>
            ))}
          </Reveal>
          <Reveal delay={150} className="mt-8 flex flex-wrap justify-center gap-3">
            <StatusChip tone="success">{t("safety.results.pass")}</StatusChip>
            <StatusChip tone="warning">{t("safety.results.warn")}</StatusChip>
            <StatusChip tone="danger">{t("safety.results.block")}</StatusChip>
          </Reveal>
        </Section>

        {/* In the field */}
        <Section id="field" tag={t("field.tag")} title={t("field.title")}>
          <Reveal className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline md:grid-cols-3">
            {fieldItems.map((item, i) => {
              const Icon = fieldIcons[i] ?? Anchor;
              return (
                <div key={item.title} className="bg-surface p-8">
                  <Icon aria-hidden className="size-5 text-accent" strokeWidth={1.5} />
                  <h3 className="mt-8 title-md text-foreground">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-body">{item.body}</p>
                </div>
              );
            })}
          </Reveal>
        </Section>

        {/* Call to action */}
        <section id="access" className="relative isolate overflow-hidden border-t border-hairline">
          <TideWaves className="-z-10 opacity-60" />
          <Reveal className="mx-auto flex max-w-[88rem] flex-col items-center px-4 py-32 text-center sm:px-8">
            <h2 className="display-sm text-balance text-foreground">{t("cta.title")}</h2>
            <p className="mt-5 max-w-[40ch] body-lg text-body">{t("cta.body")}</p>
            <Button size="lg" className="mt-10" nativeButton={false} render={<Link href="/login" />}>
              {t("cta.button")}
            </Button>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Section({
  id,
  tag,
  title,
  body,
  children,
}: {
  id?: string;
  tag?: string;
  title?: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className="mx-auto max-w-[88rem] px-4 py-24 sm:px-8 lg:px-12 lg:py-32">
        {title && (
          <Reveal className="mx-auto mb-14 flex max-w-2xl flex-col items-center text-center">
            {tag && <Tag>{tag}</Tag>}
            <h2 className="mt-5 display-sm text-balance text-foreground">{title}</h2>
            {body && <p className="mt-5 body-lg text-pretty text-body">{body}</p>}
            <div data-draw-line className="mt-10 h-px w-24 bg-accent" />
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}
