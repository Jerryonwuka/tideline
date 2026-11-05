"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Accordion; answers slide open with a grid-rows transition. */
export function Faq() {
  const t = useTranslations("home.faq");
  const items = t.raw("items") as { q: string; a: string }[];
  const [open, setOpen] = useState<number | null>(0);

  return (
    <dl className="border-t border-hairline">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="border-b border-hairline">
            <dt>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full cursor-pointer items-center justify-between gap-6 py-6 text-left title-md text-foreground transition-colors hover:text-accent"
              >
                {item.q}
                <Plus
                  className={cn(
                    "size-4 shrink-0 text-meta transition-transform duration-(--duration-tide) ease-tide",
                    isOpen && "rotate-45 text-foreground",
                  )}
                />
              </button>
            </dt>
            <dd
              id={`faq-${i}`}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-500 ease-tide",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <p className="max-w-[60ch] pb-6 body-md text-body">{item.a}</p>
              </div>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
