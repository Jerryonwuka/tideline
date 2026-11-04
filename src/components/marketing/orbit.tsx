import { CloudSun, CreditCard, FileText, MapPin, MessageCircle, MessageSquareText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Brackets } from "./brackets";

const SATELLITES = [
  { key: "whatsapp", icon: MessageCircle },
  { key: "payments", icon: CreditCard },
  { key: "weather", icon: CloudSun },
  { key: "documents", icon: FileText },
  { key: "sms", icon: MessageSquareText },
  { key: "maps", icon: MapPin },
] as const;

/** A wireframe globe with the services Tideline connects slowly orbiting the platform. */
export async function Orbit() {
  const t = await getTranslations("home.platform.connect.demo");
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[19rem]">
      <svg aria-hidden viewBox="0 0 200 200" className="absolute inset-[8%] text-hairline-strong">
        <circle cx="100" cy="100" r="99" fill="none" stroke="currentColor" />
        {[0.82, 0.58, 0.3].map((k) => (
          <ellipse key={`m${k}`} cx="100" cy="100" rx={99 * k} ry="99" fill="none" stroke="currentColor" />
        ))}
        {[-60, -30, 0, 30, 60].map((y) => (
          <ellipse
            key={`p${y}`}
            cx="100"
            cy={100 + y}
            rx={Math.sqrt(99 * 99 - y * y)}
            ry={Math.sqrt(99 * 99 - y * y) * 0.18}
            fill="none"
            stroke="currentColor"
          />
        ))}
      </svg>
      {/* Satellites ride a rotating ring; each one counter-rotates to stay upright. */}
      <div className="absolute inset-0 motion-safe:animate-orbit">
        {SATELLITES.map(({ key, icon: Icon }, i) => {
          const angle = (i / SATELLITES.length) * 2 * Math.PI - Math.PI / 2;
          const x = 50 + Math.cos(angle) * 46;
          const y = 50 + Math.sin(angle) * 46;
          return (
            <div
              key={key}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div
                title={t(`items.${key}`)}
                className="flex size-11 items-center justify-center rounded-sm border border-hairline-strong bg-surface-raised text-foreground shadow-md motion-safe:animate-orbit-reverse"
              >
                <Icon className="size-4" strokeWidth={1.75} />
                <span className="sr-only">{t(`items.${key}`)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="group/brackets absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xs border border-hairline-strong bg-background shadow-lg">
        <Brackets size={7} offset={5} className="text-foreground/50" />
        <Logo variant="icon" size={30} accent="foam" />
      </div>
    </div>
  );
}
