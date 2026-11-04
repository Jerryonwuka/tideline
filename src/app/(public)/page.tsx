import { Layers, Mic, Radio, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BracketIcon } from "@/components/marketing/brackets";
import { ControlRoom } from "@/components/marketing/control-room";
import { Faq } from "@/components/marketing/faq";
import { Horizon } from "@/components/marketing/horizon";
import { ModeTabs } from "@/components/marketing/mode-tabs";
import { Orbit } from "@/components/marketing/orbit";
import { SafetyStack } from "@/components/marketing/safety-stack";
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
        {/* Hero */}
        <Frame className="isolate">
          <Horizon className="-z-10" />
          <div className="flex min-h-[44rem] flex-col items-center justify-center px-4 pt-32 pb-20 text-center sm:min-h-[48rem] sm:px-8">
            <Reveal>
              <Tag>{t("hero.tag")}</Tag>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="mx-auto mt-7 max-w-[15ch] display-xl text-balance text-foreground">{t("hero.title")}</h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="mx-auto mt-6 max-w-[46ch] body-lg text-pretty text-body">
                {t("hero.bodyStart")}
                <span className="text-accent">{t("hero.bodyHighlight")}</span>
                {t("hero.bodyEnd")}
              </p>
            </Reveal>
            <Reveal delay={300} className="mt-10 flex w-full justify-center">
              <StartForm id="start" />
            </Reveal>
          </div>
        </Frame>

        {/* Vessel types band */}
        <Frame>
          <VesselGrid />
        </Frame>

        {/* Platform */}
        <Frame id="platform">
          <SectionIntro title={t("platform.title")} body={t("platform.body")} />
          <Reveal className="grid gap-px border-y border-hairline bg-hairline lg:grid-cols-3">
            <Feature icon={<Radio />} title={t("platform.crew.title")} body={t("platform.crew.body")}>
              <ControlRoom />
            </Feature>
            <Feature icon={<Layers />} title={t("platform.safety.title")} body={t("platform.safety.body")}>
              <SafetyStack />
            </Feature>
            <Feature icon={<ShieldCheck />} title={t("platform.connect.title")} body={t("platform.connect.body")}>
              <Orbit />
            </Feature>
          </Reveal>
        </Frame>

        {/* Process */}
        <Frame id="process">
          <Reveal className="grid gap-6 border-b border-hairline px-6 pt-24 pb-12 sm:px-12 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:pt-32">
            <h2 className="display-lg text-balance text-foreground">{t("process.title")}</h2>
            <p className="max-w-[44ch] body-lg text-body">{t("process.body")}</p>
          </Reveal>
          <div className="relative isolate overflow-hidden px-4 sm:px-10">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_100%,var(--glow),transparent_70%)]"
            />
            <Reveal>
              <VoyageFlow />
            </Reveal>
          </div>
          <Reveal className="grid gap-px border-y border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <div key={step.title} className="panel p-8 sm:p-10">
                <span className="font-mono text-sm text-meta">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-10 title-lg text-foreground">{step.title}</h3>
                <p className="mt-3 body-md text-body">{step.body}</p>
              </div>
            ))}
          </Reveal>
        </Frame>

        {/* Modes — contrasting band */}
        <section id="modes" className="theme-invert scroll-mt-20">
          <div className="mx-auto max-w-[84rem] border-x border-hairline px-6 py-24 sm:px-12 lg:py-32">
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="display-lg text-balance text-foreground">{t("modes.title")}</h2>
              <p className="mt-5 body-lg text-body">{t("modes.body")}</p>
            </Reveal>
            <Reveal delay={100}>
              <ModeTabs />
            </Reveal>
          </div>
        </section>

        {/* In the field */}
        <Frame>
          <SectionIntro title={t("field.title")} />
          <Reveal className="grid gap-px border-y border-hairline bg-hairline md:grid-cols-3">
            {field.map((item, i) => {
              const Icon = fieldIcons[i] ?? Smartphone;
              return (
                <div key={item.title} className="panel p-8 sm:p-10">
                  <BracketIcon>
                    <Icon />
                  </BracketIcon>
                  <h3 className="mt-8 title-lg text-foreground">{item.title}</h3>
                  <p className="mt-3 body-md text-body">{item.body}</p>
                </div>
              );
            })}
          </Reveal>
        </Frame>

        {/* FAQ */}
        <Frame id="faq">
          <div className="grid gap-12 px-6 py-24 sm:px-12 lg:grid-cols-[1fr_1.6fr] lg:py-32">
            <Reveal>
              <h2 className="display-lg text-foreground">{t("faq.title")}</h2>
            </Reveal>
            <Reveal delay={100}>
              <Faq />
            </Reveal>
          </div>
        </Frame>

        {/* Final call to action */}
        <Frame className="isolate border-t border-hairline">
          <Horizon className="-z-10" />
          <Reveal className="flex flex-col items-center px-4 py-32 text-center sm:px-8 lg:py-40">
            <h2 className="max-w-[16ch] display-lg text-balance text-foreground">{t("cta.title")}</h2>
            <p className="mt-5 max-w-[46ch] body-lg text-body">{t("cta.body")}</p>
            <div className="mt-10 flex w-full justify-center">
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

function SectionIntro({ title, body }: { title: string; body?: string }) {
  return (
    <Reveal className="mx-auto flex max-w-2xl flex-col items-center px-6 pt-24 pb-14 text-center lg:pt-32">
      <h2 className="display-lg text-balance text-foreground">{title}</h2>
      {body && <p className="mt-5 body-lg text-pretty text-body">{body}</p>}
    </Reveal>
  );
}

function Feature({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-col overflow-hidden panel p-8 sm:p-10">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_50%_100%,var(--glow),transparent_70%)]"
      />
      <BracketIcon>{icon}</BracketIcon>
      <h3 className="mt-8 title-lg text-foreground">{title}</h3>
      <p className="mt-3 max-w-[38ch] body-md text-body">{body}</p>
      <div className="relative mt-12 flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}
