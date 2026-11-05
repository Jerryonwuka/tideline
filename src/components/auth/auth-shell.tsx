import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Brackets } from "@/components/marketing/brackets";
import { Horizon } from "@/components/marketing/horizon";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/** Frame for sign-in and onboarding: logo, theme switch, one centred panel over the harbour glow. */
export function AuthShell({
  children,
  aside,
  wide = false,
}: {
  children: ReactNode;
  aside?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <Horizon className="-z-10" water />
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link href="/" className="rounded-xs focus-visible:outline-2 focus-visible:outline-accent">
          <Logo size={20} />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16 sm:items-center sm:pt-0">
        <div className={`group/brackets relative w-full ${wide ? "max-w-xl" : "max-w-md"}`}>
          <Brackets size={10} offset={8} className="text-foreground/30" />
          <div className="rounded-sm border border-hairline-strong panel p-6 shadow-lg sm:p-8">{children}</div>
          {aside && <div className="mt-4">{aside}</div>}
        </div>
      </main>
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xs border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
