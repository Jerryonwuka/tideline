import { getTranslations } from "next-intl/server";
import Link from "next/link";

/** Onboarding step title with a "skip for now" link. */
export async function StepHeader({
  step,
  title,
  subtitle,
  skipHref,
  skipLabel,
}: {
  step: number;
  title: string;
  subtitle: string;
  skipHref?: string;
  skipLabel?: string;
}) {
  const t = await getTranslations("onboarding");
  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label-mono-sm text-accent">{t("step", { current: step, total: 5 })}</span>
        {skipHref && (
          <Link href={skipHref} className="text-sm text-body hover:text-foreground">
            {skipLabel}
          </Link>
        )}
      </div>
      <h1 className="heading text-foreground">{title}</h1>
      <p className="text-sm text-body">{subtitle}</p>
    </div>
  );
}
