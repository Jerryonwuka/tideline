"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/** Primary navigation; also auto-submits the company switcher when it changes. */
export function AppNav({ links, label }: { links: { href: string; label: string }[]; label: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const select = document.querySelector<HTMLSelectElement>("select[data-autosubmit]");
    const onChange = () => select?.form?.requestSubmit();
    select?.addEventListener("change", onChange);
    return () => select?.removeEventListener("change", onChange);
  }, []);
  return (
    <nav aria-label={label} className="ml-2 flex items-center gap-1">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-xs px-3 py-1.5 text-sm transition-colors",
              active ? "bg-surface-raised text-foreground" : "text-body hover:bg-surface-raised hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
