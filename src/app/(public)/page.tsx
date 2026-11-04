import { Mic, Radio, ShieldCheck, Smartphone, WifiOff, Waypoints } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ConnectScene, SafetyScene, ShipHero } from "@/components/blueprint/lazy";
import { BracketIcon } from "@/components/marketing/brackets";
import { ControlRoom } from "@/components/marketing/control-room";
import { Faq } from "@/components/marketing/faq";
import { Horizon } from "@/components/marketing/horizon";
import { ModeTabs } from "@/components/marketing/mode-tabs";
import { StartForm } from "@/components/marketing/start-form";
import { VesselGrid } from "@/components/marketing/vessel-grid";
import { VoyageFlow } from "@/components/marketing/voyage-flow";
import { Reveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Tag } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const t = await getTranslations("home");
  const steps = t.raw("process.steps") as { title: string; body: string }[];
  const field = t.raw("field.items") as { title: string; body: string }[];
  const fieldIcons = [WifiOff, Mic, Smartphone];

  return (
    <>
      <SiteHeader />
      <main className="overflow-x-clip">
        {/* Hero: words on the left, the ship on the right */}
        <Frame className="isolate">
          <Horizon className="-z-10" />
          <div className="grid items-center gap-4 pt-24 lg:min-h-[52rem] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:pt-16">
            <div className="flex flex-col items-start px-6 pt-10 sm:px-12 lg:pt-0 lg:pr-0">
              <Reveal>
                <Tag>{t("hero.tag")}</Tag>
              </Reveal>
              <Reveal delay={100}>
                <h1 className="mt-7 max-w-[13ch] display-xl text-balance text-foreground">{t("hero.title")}</h1>
              </Reveal>
              <Reveal delay={200}>
                <p className="mt-6 max-w-[42ch] body-lg text-pretty text-body">
                  {t("hero.bodyStart")}
                  <span className="text-accent">{t("hero.bodyHighlight")}</span>
                  {t("hero.bodyEnd")}
                </p>
              </Reveal>
              <Reveal delay={300} className="mt-10 w-full">
                <StartForm id="start" />
              </Reveal>
            </div>
            <Reveal delay={200} className="relative px-3 pb-8 sm:h-[34rem] sm:px-6 lg:h-[44rem] lg:pr-8 lg:pb-0">
              <ShipHero className="size-full" />
            </Reveal>
          </div>
        </Frame>

        {/* Vessel types */}
        <Frame>
          <VesselGrid />
        </Frame>

        {/* Platform: one tall drawing, two stacked */}
        <Frame id="platform">
          <SectionHead
            index="01"
            eyebrow={t("platform.eyebrow")}
            title={t("platform.title")}
            body={t("platform.body")}
          />
          <Reveal className="grid gap-px border-y border-hairline bg-hairline lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <Feature
              className="lg:row-span-2"
              stretch
              icon={<ShieldCheck />}
              title={t("platform.safety.title")}
              body={t("platform.safety.body")}
            >
              <SafetyScene />
            </Feature>
            <Feature icon={<Radio />} title={t("platform.crew.title")} body={t("platform.crew.body")}>
              <ControlRoom />
            </Feature>
            <Feature icon={<Waypoints />} title={t("platform.connect.title")} body={t("platform.connect.body")}>
              <ConnectScene />
            </Feature>
          </Reveal>
        </Frame>

        {/* Process */}
        <Frame id="process">
          <SectionHead index="02" eyebrow={t("process.eyebrow")} title={t("process.title")} body={t("process.body")} />
          <div className="relative isolate overflow-hidden border-y border-hairline px-4 sm:px-10">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_100%,var(--glow),transparent_70%)]"
            />
            <Reveal>
              <VoyageFlow />
            </Reveal>
          </div>
          {/* Steps as a timeline */}
          <Reveal className="relative grid gap-10 px-6 py-16 sm:grid-cols-2 sm:px-12 lg:grid-cols-4 lg:gap-8">
            <div
              data-draw-line
              aria-hidden
              className="absolute top-[4.25rem] right-12 left-12 hidden h-px bg-hairline-strong lg:block"
            />
            {steps.map((step, i) => (
              <div key={step.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="relative z-10 flex size-5 items-center justify-center rounded-pill border border-accent bg-background">
                    <span className="size-1.5 rounded-pill bg-accent" />
                  </span>
                  <span className="font-mono text-sm text-meta">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-6 title-lg text-foreground">{step.title}</h3>
                <p className="mt-3 max-w-[32ch] body-md text-body">{step.body}</p>
              </div>
            ))}
          </Reveal>
        </Frame>

        {/* Modes: contrasting band */}
        <section id="modes" className="theme-invert scroll-mt-20">
          <div className="mx-auto max-w-[84rem] border-x border-hairline">
            <SectionHead index="03" eyebrow={t("modes.eyebrow")} title={t("modes.title")} body={t("modes.body")} />
            <Reveal delay={100} className="px-6 pb-24 sm:px-12 lg:pb-32">
              <ModeTabs />
            </Reveal>
          </div>
        </section>

        {/* In the field: rows */}
        <Frame>
          <SectionHead index="04" eyebrow={t("field.eyebrow")} title={t("field.title")} />
          <Reveal className="border-t border-hairline">
            {field.map((item, i) => {
              const Icon = fieldIcons[i] ?? Smartphone;
              return (
                <div
                  key={item.title}
                  className="group/row grid gap-4 border-b border-hairline px-6 py-8 transition-colors duration-(--duration-tide) ease-tide hover:bg-surface sm:px-12 md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.3fr)] md:items-center"
                >
                  <BracketIcon className="transition-colors group-hover/row:text-accent">
                    <Icon />
                  </BracketIcon>
                  <h3 className="title-lg text-foreground">{item.title}</h3>
                  <p className="max-w-[48ch] body-md text-body">{item.body}</p>
                </div>
              );
            })}
          </Reveal>
        </Frame>

        {/* FAQ */}
        <Frame id="faq">
          <div className="grid gap-12 px-6 py-24 sm:px-12 lg:grid-cols-[1fr_1.6fr] lg:py-32">
            <Reveal>
              <Eyebrow index="05">{t("faq.eyebrow")}</Eyebrow>
              <h2 className="mt-5 display-lg text-foreground">{t("faq.title")}</h2>
            </Reveal>
            <Reveal delay={100}>
              <Faq />
            </Reveal>
          </div>
        </Frame>

        {/* Final call to action */}
        <Frame className="isolate border-t border-hairline">
          <Horizon className="-z-10" water />
          <Reveal className="grid items-end gap-10 px-6 py-28 sm:px-12 lg:grid-cols-2 lg:py-36">
            <div>
              <h2 className="max-w-[14ch] display-lg text-balance text-foreground">{t("cta.title")}</h2>
              <p className="mt-5 max-w-[44ch] body-lg text-body">{t("cta.body")}</p>
            </div>
            <div className="lg:justify-self-end">
              <StartForm id="start-bottom" />
            </div>
          </Reveal>
        </Frame>
      </main>
      <SiteFooter />
    </>
  );
}

/** Full-width section whose content sits inside the page's two vertical rails. */
function Frame({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className={cn("relative mx-auto max-w-[84rem] border-x border-hairline", className)}>{children}</div>
    </section>
  );
}

function Eyebrow({ index, children }: { index: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-3 label-mono-sm text-meta">
      <span className="text-accent">{index}</span>
      <span className="h-px w-6 bg-hairline-strong" />
      {children}
    </span>
  );
}

/** Left-aligned section heading: title on the left, supporting line on the right. */
function SectionHead({
  index,
  eyebrow,
  title,
  body,
}: {
  index: string;
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <Reveal className="grid gap-6 px-6 pt-24 pb-14 sm:px-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end lg:pt-32">
      <div>
        <Eyebrow index={index}>{eyebrow}</Eyebrow>
        <h2 className="mt-5 max-w-[18ch] display-lg text-balance text-foreground">{title}</h2>
      </div>
      {body && <p className="max-w-[44ch] body-lg text-pretty text-body">{body}</p>}
    </Reveal>
  );
}

function Feature({
  icon,
  title,
  body,
  className,
  stretch = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  className?: string;
  /** Let the illustration fill the remaining height of a tall cell. */
  stretch?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative flex flex-col overflow-hidden panel p-8 sm:p-10", className)}>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_50%_100%,var(--glow),transparent_70%)]"
      />
      <BracketIcon>{icon}</BracketIcon>
      <h3 className="mt-8 title-lg text-foreground">{title}</h3>
      <p className="mt-3 max-w-[40ch] body-md text-body">{body}</p>
      <div className={cn("relative mt-10 flex flex-1 justify-center", stretch ? "items-stretch" : "items-center")}>
        {children}
      </div>
    </div>
  );
}
