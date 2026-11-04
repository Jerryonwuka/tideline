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
  { href: "#modes", key: "ferry" },
  { href: "#modes", key: "charter" },
  { href: "#safety", key: "safety" },
  { href: "#field", key: "field" },
] as const;

export function SiteHeader() {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-(--duration-tide) ease-tide",
        scrolled || open ? "border-hairline bg-background/80 backdrop-blur-md" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[88rem] items-center justify-between gap-6 px-4 sm:px-8 lg:px-12">
        <Link href="/" className="rounded-xs focus-visible:outline-2 focus-visible:outline-accent">
          <Logo size={22} />
        </Link>
        <nav aria-label={t("label")} className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.key}
              href={l.href}
              className="label-mono-sm text-meta transition-colors duration-(--duration-hover) ease-hover hover:text-foreground"
            >
              {t(l.key)}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Button variant="secondary" size="sm" nativeButton={false} render={<Link href="/login" />}>
            {t("login")}
          </Button>
          <Button size="sm" nativeButton={false} render={<a href="#access" />}>
            {t("access")}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? t("close") : t("menu")}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <div id="mobile-nav" className="border-t border-hairline px-4 pt-2 pb-6 md:hidden">
          <nav aria-label={t("label")} className="flex flex-col">
            {LINKS.map((l) => (
              <a
                key={l.key}
                href={l.href}
                onClick={() => setOpen(false)}
                className="border-b border-hairline py-4 label-mono text-body hover:text-foreground"
              >
                {t(l.key)}
              </a>
            ))}
          </nav>
          <div className="mt-6 flex items-center justify-between gap-3">
            <ThemeToggle />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" nativeButton={false} render={<Link href="/login" />}>
                {t("login")}
              </Button>
              <Button size="sm" nativeButton={false} render={<a href="#access" onClick={() => setOpen(false)} />}>
                {t("access")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
