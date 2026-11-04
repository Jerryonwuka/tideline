"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#platform", key: "platform" },
  { href: "#fleet", key: "fleet" },
  { href: "#process", key: "process" },
  { href: "#modes", key: "modes" },
  { href: "#faq", key: "faq" },
] as const;

/** Floating pill navigation, centred over the page. */
export function SiteHeader() {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-[56rem] rounded-md border transition-[background-color,border-color,box-shadow] duration-(--duration-tide) ease-tide",
          scrolled || open
            ? "border-hairline-strong bg-background/75 shadow-lg backdrop-blur-xl"
            : "border-hairline bg-background/40 backdrop-blur-md",
        )}
      >
        <div className="flex h-12 items-center justify-between gap-4 pr-1.5 pl-4">
          <Link href="/" className="rounded-xs focus-visible:outline-2 focus-visible:outline-accent">
            <Logo size={18} />
          </Link>
          <nav aria-label={t("label")} className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <a
                key={l.key}
                href={l.href}
                className="rounded-xs px-3 py-1.5 text-[0.8125rem] text-body transition-colors duration-(--duration-hover) ease-hover hover:bg-surface-raised hover:text-foreground"
              >
                {t(l.key)}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <ThemeToggle />
            <Link
              href="/login"
              className="px-2 text-[0.8125rem] text-body transition-colors duration-(--duration-hover) hover:text-foreground"
            >
              {t("login")}
            </Link>
            <Button size="sm" marks={false} nativeButton={false} render={<a href="#start" />}>
              {t("demo")}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t("close") : t("menu")}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
        {open && (
          <div id="mobile-nav" className="border-t border-hairline px-4 pt-1 pb-4 lg:hidden">
            <nav aria-label={t("label")} className="flex flex-col">
              {LINKS.map((l) => (
                <a
                  key={l.key}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-hairline py-3.5 text-[0.9375rem] text-body hover:text-foreground"
                >
                  {t(l.key)}
                </a>
              ))}
            </nav>
            <div className="mt-4 flex items-center justify-between gap-3">
              <ThemeToggle />
              <div className="flex items-center gap-3">
                <Link href="/login" className="text-sm text-body">
                  {t("login")}
                </Link>
                <Button
                  size="sm"
                  marks={false}
                  nativeButton={false}
                  render={<a href="#start" onClick={() => setOpen(false)} />}
                >
                  {t("demo")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
